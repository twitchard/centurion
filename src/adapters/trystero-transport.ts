import { joinRoom as joinNostrRoom } from 'trystero'
import { getRelaySockets as getNostrRelaySockets } from 'trystero/nostr'
import { joinRoom as joinTorrentRoom } from 'trystero/torrent'
import { getRelaySockets as getTorrentRelaySockets } from 'trystero/torrent'
import {
  NOOP_TRANSPORT_CALLBACKS,
  type TransportCallbacks,
  type TransportPort,
  type TransportStatus,
} from '../ports/transport'

const DEFAULT_APP_ID = 'centurion-chess-chat-lab-v1'
const GUEST_CONNECT_ATTEMPT_MS = 25_000
const GUEST_MAX_CONNECT_ATTEMPTS = 3
const RELAY_STATUS_INTERVAL_MS = 5_000
const ICE_STATUS_INTERVAL_MS = 4_000

type SignallingChannel = 'torrent' | 'nostr'
type Room = ReturnType<typeof joinNostrRoom>
type Sender = (data: unknown, targetPeers?: readonly string[]) => void

/**
 * BitTorrent WebSocket trackers announce pre-built WebRTC offers immediately,
 * which is much faster and more reliable than waiting for Nostr peer discovery.
 */
/** Verified live WebSocket trackers (others in Trystero defaults are dead or hang). */
const TRACKER_URLS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
]

/**
 * Nostr relays as a secondary signalling path. Trystero otherwise derives a
 * subset of its default relay list from the appId, and that subset is largely
 * dead. Both peers always use the same curated list.
 */
const NOSTR_RELAY_URLS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://offchain.pub',
  'wss://relay.fountain.fm',
  'wss://nostr.mom',
  'wss://purplepag.es',
]

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

type JoinRoomFn = (
  config: {
    appId: string
    turnConfig: RTCIceServer[]
    rtcConfig: RTCConfiguration
    relayUrls: string[]
  },
  roomId: string,
  onJoinError?: (details: {
    error: string
    appId: string
    roomId: string
    peerId: string
  }) => void,
) => Room

const CHANNEL_CONFIG: ReadonlyArray<{
  readonly channel: SignallingChannel
  readonly label: string
  readonly join: JoinRoomFn
  readonly relayUrls: readonly string[]
  readonly getSockets: () => Record<string, WebSocket>
}> = [
  {
    channel: 'torrent',
    label: 'BitTorrent trackers',
    join: joinTorrentRoom as JoinRoomFn,
    relayUrls: TRACKER_URLS,
    getSockets: getTorrentRelaySockets,
  },
  {
    channel: 'nostr',
    label: 'Nostr relays',
    join: joinNostrRoom as JoinRoomFn,
    relayUrls: NOSTR_RELAY_URLS,
    getSockets: getNostrRelaySockets,
  },
]

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

function summarizeSocketHealth(
  label: string,
  sockets: Record<string, WebSocket>,
): string {
  const entries = Object.entries(sockets)
  if (entries.length === 0) {
    return `${label}: none connected yet`
  }
  const openCount = entries.filter(
    ([, socket]) => socket.readyState === WebSocket.OPEN,
  ).length
  return `${label}: ${openCount}/${entries.length} open`
}

export class TrysteroTransportAdapter implements TransportPort {
  private rooms = new Map<SignallingChannel, Room>()
  private activeChannel: SignallingChannel | null = null
  private sendFn: Sender | null = null
  private callbacks: TransportCallbacks = NOOP_TRANSPORT_CALLBACKS
  private currentStatus: TransportStatus = 'disconnected'
  private readonly appId: string
  private guestConnectTimer: ReturnType<typeof setTimeout> | null = null
  private relayStatusTimer: ReturnType<typeof setInterval> | null = null
  private iceStatusTimer: ReturnType<typeof setInterval> | null = null
  private guestConnectAttempt = 0
  private leavePromise: Promise<void> = Promise.resolve()
  private openGeneration = 0

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
    this.disconnect()
    this.code = TrysteroTransportAdapter.generateCode()
    this.isHost = true
    this.guestConnectAttempt = 0
    this.setStatus('connecting')
    void this.openRoom()
    return this.code
  }

  hostRoom(code: string): void {
    this.disconnect()
    this.code = code
    this.isHost = true
    this.guestConnectAttempt = 0
    this.setStatus('connecting')
    void this.openRoom()
  }

  joinRoom(code: string): void {
    this.disconnect()
    this.code = code
    this.isHost = false
    this.guestConnectAttempt = 0
    this.setStatus('connecting')
    void this.openRoom()
  }

  send(data: unknown): void {
    this.sendFn?.(data)
  }

  disconnect(): void {
    void this.teardownRooms()
    this.currentStatus = 'disconnected'
    this.code = ''
    this.isHost = false
    this.guestConnectAttempt = 0
    this.activeChannel = null
    this.sendFn = null
  }

  private log(message: string): void {
    this.callbacks.onLog?.(message)
  }

  private scheduleLeave(room: Room): Promise<void> {
    this.leavePromise = this.leavePromise.then(() => room.leave())
    return this.leavePromise
  }

  private async teardownRooms(): Promise<void> {
    this.clearGuestConnectTimer()
    this.clearMonitoringTimers()
    this.openGeneration += 1
    const rooms = [...this.rooms.values()]
    this.rooms.clear()
    this.activeChannel = null
    this.sendFn = null
    for (const room of rooms) {
      await this.scheduleLeave(room)
    }
    await this.leavePromise
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
        void this.retryGuestConnect()
        return
      }
      this.log(
        `Timed out waiting for WebRTC peer connection after ${GUEST_MAX_CONNECT_ATTEMPTS} attempts. Confirm the host is still waiting and try Wi‑Fi.`,
      )
      this.setStatus('error')
      void this.teardownRooms()
    }, GUEST_CONNECT_ATTEMPT_MS)
  }

  private async retryGuestConnect(): Promise<void> {
    await this.teardownRooms()
    await this.openRoom()
  }

  private setStatus(status: TransportStatus): void {
    this.currentStatus = status
    this.callbacks.onStatusChange(status)
  }

  private logRelayStatus(): void {
    for (const { label, getSockets } of CHANNEL_CONFIG) {
      this.log(summarizeSocketHealth(label, getSockets()))
    }
  }

  private logIceStatus(): void {
    const summaries = CHANNEL_CONFIG.map(({ channel, label }) => {
      const room = this.rooms.get(channel)
      if (!room) {
        return `${label}: not joined`
      }
      return `${label}: ${summarizeIceStates(room.getPeers())}`
    })
    this.log(`WebRTC negotiation — ${summaries.join(' | ')}`)
  }

  private startGuestMonitoring(): void {
    this.clearMonitoringTimers()
    setTimeout(() => {
      this.logRelayStatus()
      this.logIceStatus()
    }, 2_000)
    this.relayStatusTimer = setInterval(() => {
      if (this.currentStatus !== 'connecting') {
        this.clearMonitoringTimers()
        return
      }
      this.logRelayStatus()
    }, RELAY_STATUS_INTERVAL_MS)
    this.iceStatusTimer = setInterval(
      () => this.logIceStatus(),
      ICE_STATUS_INTERVAL_MS,
    )
  }

  private startHostWaitingMonitoring(): void {
    this.clearMonitoringTimers()
    setTimeout(() => {
      this.logRelayStatus()
      this.logIceStatus()
    }, 2_000)
    this.relayStatusTimer = setInterval(() => {
      if (this.currentStatus !== 'waiting' || !this.isHost) {
        this.clearMonitoringTimers()
        return
      }
      this.logRelayStatus()
      this.logIceStatus()
    }, 10_000)
  }

  private async openRoom(): Promise<void> {
    await this.leavePromise
    const roomId = `${this.appId}-${this.code}`
    const generation = this.openGeneration
    const attemptLabel =
      !this.isHost && this.guestConnectAttempt > 0
        ? ` (retry ${this.guestConnectAttempt + 1}/${GUEST_MAX_CONNECT_ATTEMPTS})`
        : ''

    const joinConfig = {
      appId: this.appId,
      turnConfig: TURN_CONFIG,
      rtcConfig: RTC_CONFIG,
    }

    this.log(
      `Opening match room id=${roomId} via BitTorrent trackers + Nostr relays${attemptLabel}`,
    )

    for (const { channel, label, join, relayUrls } of CHANNEL_CONFIG) {
      try {
        const room = join(
          { ...joinConfig, relayUrls: [...relayUrls] },
          roomId,
          (details) => {
            this.log(
              `${label} join error (peer ${details.peerId}): ${details.error}`,
            )
          },
        )
        if (generation !== this.openGeneration) {
          await room.leave()
          continue
        }
        this.rooms.set(channel, room)
        this.wireRoom(room, channel, label)
        this.log(`${label}: joined room`)
      } catch (error: unknown) {
        this.log(
          `${label} joinRoom threw: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    if (this.rooms.size === 0) {
      this.setStatus('error')
      return
    }

    if (this.isHost) {
      this.setStatus('waiting')
      this.log(
        'Host room ready; waiting for guest. Keep this page open until they join.',
      )
      this.startHostWaitingMonitoring()
      return
    }

    this.startGuestMonitoring()

    this.log(
      'Guest waiting for host via trackers and Nostr (host must still be on the waiting screen).',
    )
    this.startGuestConnectTimer()
  }

  private wireRoom(
    room: Room,
    channel: SignallingChannel,
    label: string,
  ): void {
    const [send, receive] = room.makeAction('chat')

    receive((data: unknown) => {
      if (this.activeChannel !== null && this.activeChannel !== channel) {
        return
      }
      this.callbacks.onMessage(data)
    })

    room.onPeerJoin((peerId) => {
      if (this.activeChannel !== null && this.activeChannel !== channel) {
        return
      }

      this.activeChannel = channel
      this.sendFn = send as Sender
      this.clearGuestConnectTimer()
      this.clearMonitoringTimers()
      this.log(`${label}: peer joined (${peerId})`)
      this.setStatus('connected')

      for (const [otherChannel, otherRoom] of this.rooms) {
        if (otherChannel === channel) {
          continue
        }
        this.rooms.delete(otherChannel)
        void this.scheduleLeave(otherRoom)
      }

      this.callbacks.onPeerJoin()
    })

    room.onPeerLeave((peerId) => {
      if (this.activeChannel !== null && this.activeChannel !== channel) {
        return
      }
      this.log(`${label}: peer left (${peerId})`)
      this.activeChannel = null
      this.sendFn = null
      this.setStatus(this.isHost ? 'waiting' : 'disconnected')
      this.callbacks.onPeerLeave()
    })
  }

  private static generateCode(): string {
    return String(Math.floor(100_000 + Math.random() * 900_000))
  }
}
