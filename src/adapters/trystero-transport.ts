import { joinRoom } from 'trystero'
import { getRelaySockets } from 'trystero/nostr'
import {
  NOOP_TRANSPORT_CALLBACKS,
  type TransportCallbacks,
  type TransportPort,
  type TransportStatus,
} from '../ports/transport'

const DEFAULT_APP_ID = 'centurion-chess-chat-lab-v1'
const GUEST_CONNECT_ATTEMPT_MS = 20_000
const GUEST_MAX_CONNECT_ATTEMPTS = 3
const RELAY_STATUS_INTERVAL_MS = 5_000
const ICE_STATUS_INTERVAL_MS = 4_000

/**
 * Explicit signalling relays. Trystero otherwise derives a subset of its
 * default relay list from the appId, and the subset our appIds land on
 * is largely dead (expired certs, defunct hosts), which made matchmaking
 * silently hang. These are large, long-lived public relays; both peers
 * always use the same list.
 */
const RELAY_URLS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://offchain.pub',
  'wss://relay.fountain.fm',
  'wss://nostr.mom',
  'wss://relay.nostr.band',
  'wss://purplepag.es',
]

/**
 * Public STUN/TURN for networks that block direct WebRTC (mobile CGNAT, VPN,
 * corporate firewalls). Includes TURNS (TLS) and TCP transports for strict NAT.
 */
const TURN_CONFIG: RTCIceServer[] = [
  {
    urls: 'stun:openrelay.metered.ca:80',
  },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:80?transport=tcp',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

const RTC_CONFIG: RTCConfiguration = {
  iceCandidatePoolSize: 10,
}

type Room = ReturnType<typeof joinRoom>
type Sender = (data: unknown, targetPeers?: readonly string[]) => void

function relayReadyStateLabel(readyState: number): string {
  switch (readyState) {
    case WebSocket.CONNECTING:
      return 'connecting'
    case WebSocket.OPEN:
      return 'open'
    case WebSocket.CLOSING:
      return 'closing'
    case WebSocket.CLOSED:
      return 'closed'
    default:
      return `unknown(${readyState})`
  }
}

function summarizeIceStates(peers: Record<string, RTCPeerConnection>): string {
  const entries = Object.entries(peers)
  if (entries.length === 0) {
    return 'no peer negotiations yet'
  }
  return entries
    .map(
      ([id, pc]) =>
        `${id.slice(0, 8)}… ice=${pc.iceConnectionState} conn=${pc.connectionState}`,
    )
    .join('; ')
}

export class TrysteroTransportAdapter implements TransportPort {
  private room: Room | null = null
  private sendFn: Sender | null = null
  private callbacks: TransportCallbacks = NOOP_TRANSPORT_CALLBACKS
  private currentStatus: TransportStatus = 'disconnected'
  private readonly appId: string
  private guestConnectTimer: ReturnType<typeof setTimeout> | null = null
  private relayStatusTimer: ReturnType<typeof setInterval> | null = null
  private iceStatusTimer: ReturnType<typeof setInterval> | null = null
  private guestConnectAttempt = 0

  code = ''
  isHost = false

  constructor(appId: string = DEFAULT_APP_ID) {
    this.appId = appId
  }

  get status(): TransportStatus {
    return this.currentStatus
  }

  setCallbacks(callbacks: TransportCallbacks): void {
    this.callbacks = callbacks
  }

  createRoom(): string {
    this.teardownRoom()
    this.code = TrysteroTransportAdapter.generateCode()
    this.isHost = true
    this.guestConnectAttempt = 0
    this.setStatus('connecting')
    this.openRoom()
    return this.code
  }

  hostRoom(code: string): void {
    this.teardownRoom()
    this.code = code
    this.isHost = true
    this.guestConnectAttempt = 0
    this.setStatus('connecting')
    this.openRoom()
  }

  joinRoom(code: string): void {
    this.teardownRoom()
    this.code = code
    this.isHost = false
    this.guestConnectAttempt = 0
    this.setStatus('connecting')
    this.openRoom()
  }

  send(data: unknown): void {
    this.sendFn?.(data)
  }

  disconnect(): void {
    this.teardownRoom()
    this.currentStatus = 'disconnected'
    this.code = ''
    this.isHost = false
    this.guestConnectAttempt = 0
  }

  private log(message: string): void {
    this.callbacks.onLog?.(message)
  }

  private teardownRoom(): void {
    this.clearGuestConnectTimer()
    this.clearMonitoringTimers()
    this.room?.leave()
    this.room = null
    this.sendFn = null
  }

  private clearGuestConnectTimer(): void {
    if (this.guestConnectTimer !== null) {
      clearTimeout(this.guestConnectTimer)
      this.guestConnectTimer = null
    }
  }

  private clearMonitoringTimers(): void {
    if (this.relayStatusTimer !== null) {
      clearInterval(this.relayStatusTimer)
      this.relayStatusTimer = null
    }
    if (this.iceStatusTimer !== null) {
      clearInterval(this.iceStatusTimer)
      this.iceStatusTimer = null
    }
  }

  private startGuestConnectTimer(): void {
    this.clearGuestConnectTimer()
    const attempt = this.guestConnectAttempt + 1
    this.guestConnectTimer = setTimeout(() => {
      this.guestConnectTimer = null
      if (this.isHost || this.currentStatus !== 'connecting') {
        return
      }
      if (attempt < GUEST_MAX_CONNECT_ATTEMPTS) {
        this.log(
          `WebRTC handshake timed out (${GUEST_CONNECT_ATTEMPT_MS / 1000}s, attempt ${attempt}/${GUEST_MAX_CONNECT_ATTEMPTS}). Retrying…`,
        )
        this.guestConnectAttempt = attempt
        this.retryGuestConnect()
        return
      }
      this.log(
        `Timed out waiting for WebRTC peer connection after ${GUEST_MAX_CONNECT_ATTEMPTS} attempts. Try another network or disable VPN.`,
      )
      this.setStatus('error')
      this.teardownRoom()
    }, GUEST_CONNECT_ATTEMPT_MS)
  }

  private retryGuestConnect(): void {
    this.clearMonitoringTimers()
    this.room?.leave()
    this.room = null
    this.sendFn = null
    this.openRoom()
  }

  private setStatus(status: TransportStatus): void {
    this.currentStatus = status
    this.callbacks.onStatusChange(status)
  }

  private logRelayStatus(): void {
    const sockets = getRelaySockets()
    const entries = Object.entries(sockets)
    if (entries.length === 0) {
      this.log('Nostr relays: none connected yet.')
      return
    }
    const openCount = entries.filter(
      ([, socket]) => (socket as WebSocket).readyState === WebSocket.OPEN,
    ).length
    this.log(
      `Nostr relays: ${openCount}/${entries.length} open (${entries.map(([url, socket]) => `${url.split('//')[1]}:${relayReadyStateLabel((socket as WebSocket).readyState)}`).join(', ')})`,
    )
  }

  private logIceStatus(): void {
    if (!this.room || this.currentStatus !== 'connecting') {
      return
    }
    const peers = this.room.getPeers()
    this.log(`WebRTC negotiation: ${summarizeIceStates(peers)}`)
  }

  private startMonitoring(): void {
    this.clearMonitoringTimers()
    setTimeout(() => this.logRelayStatus(), 2_000)
    this.relayStatusTimer = setInterval(() => {
      if (this.currentStatus !== 'connecting') {
        this.clearMonitoringTimers()
        return
      }
      this.logRelayStatus()
    }, RELAY_STATUS_INTERVAL_MS)
    if (!this.isHost) {
      this.iceStatusTimer = setInterval(
        () => this.logIceStatus(),
        ICE_STATUS_INTERVAL_MS,
      )
    }
  }

  private openRoom(): void {
    const roomId = `${this.appId}-${this.code}`
    const attemptLabel =
      !this.isHost && this.guestConnectAttempt > 0
        ? ` (retry ${this.guestConnectAttempt + 1}/${GUEST_MAX_CONNECT_ATTEMPTS})`
        : ''

    try {
      this.room = joinRoom(
        {
          appId: this.appId,
          turnConfig: TURN_CONFIG,
          rtcConfig: RTC_CONFIG,
          relayUrls: RELAY_URLS,
        },
        roomId,
        (details) => {
          this.log(
            `Trystero join error (peer ${details.peerId}): ${details.error}`,
          )
          if (!this.isHost && this.currentStatus === 'connecting') {
            this.setStatus('error')
          }
        },
      )
    } catch (error: unknown) {
      this.log(
        `Trystero joinRoom threw: ${error instanceof Error ? error.message : String(error)}`,
      )
      this.setStatus('error')
      return
    }

    this.log(`Joined Trystero room id=${roomId}${attemptLabel}`)
    this.startMonitoring()

    const [send, receive] = this.room.makeAction('chat')
    this.sendFn = send as Sender

    receive((data: unknown) => {
      this.callbacks.onMessage(data)
    })

    this.room.onPeerJoin((peerId) => {
      this.clearGuestConnectTimer()
      this.clearMonitoringTimers()
      this.log(`Trystero onPeerJoin: peer ${peerId}`)
      this.setStatus('connected')
      this.callbacks.onPeerJoin()
    })

    this.room.onPeerLeave((peerId) => {
      this.log(`Trystero onPeerLeave: peer ${peerId}`)
      this.setStatus(this.isHost ? 'waiting' : 'disconnected')
      this.callbacks.onPeerLeave()
    })

    if (this.isHost) {
      this.setStatus('waiting')
      this.log('Host room ready; waiting for guest to connect.')
      this.clearMonitoringTimers()
      return
    }

    this.log(
      'Guest waiting for WebRTC handshake (needs open Nostr relays + peer route).',
    )
    this.startGuestConnectTimer()
  }

  private static generateCode(): string {
    return String(Math.floor(100_000 + Math.random() * 900_000))
  }
}
