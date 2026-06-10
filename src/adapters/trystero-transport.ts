import { joinRoom } from 'trystero'
import { getRelaySockets } from 'trystero/nostr'
import {
  NOOP_TRANSPORT_CALLBACKS,
  type TransportCallbacks,
  type TransportPort,
  type TransportStatus,
} from '../ports/transport'

const DEFAULT_APP_ID = 'centurion-chess-chat-lab-v1'
const GUEST_CONNECT_TIMEOUT_MS = 45_000

/** Public TURN relay for networks that block direct WebRTC (e.g. mobile CGNAT). */
const OPENRELAY_TURN = [
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
] as const

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

export class TrysteroTransportAdapter implements TransportPort {
  private room: Room | null = null
  private sendFn: Sender | null = null
  private callbacks: TransportCallbacks = NOOP_TRANSPORT_CALLBACKS
  private currentStatus: TransportStatus = 'disconnected'
  private readonly appId: string
  private guestConnectTimer: ReturnType<typeof setTimeout> | null = null

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
    this.setStatus('connecting')
    this.connect()
    return this.code
  }

  joinRoom(code: string): void {
    this.disconnect()
    this.code = code
    this.isHost = false
    this.setStatus('connecting')
    this.connect()
  }

  send(data: unknown): void {
    this.sendFn?.(data)
  }

  disconnect(): void {
    this.clearGuestConnectTimer()
    this.room?.leave()
    this.room = null
    this.sendFn = null
    this.currentStatus = 'disconnected'
    this.code = ''
    this.isHost = false
  }

  private log(message: string): void {
    this.callbacks.onLog?.(message)
  }

  private clearGuestConnectTimer(): void {
    if (this.guestConnectTimer !== null) {
      clearTimeout(this.guestConnectTimer)
      this.guestConnectTimer = null
    }
  }

  private startGuestConnectTimer(): void {
    this.clearGuestConnectTimer()
    this.guestConnectTimer = setTimeout(() => {
      this.guestConnectTimer = null
      if (this.isHost || this.currentStatus !== 'connecting') {
        return
      }
      this.log(
        'Timed out waiting for WebRTC peer connection (45s). Try another network or disable VPN.',
      )
      this.setStatus('error')
      this.room?.leave()
      this.room = null
      this.sendFn = null
    }, GUEST_CONNECT_TIMEOUT_MS)
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
    for (const [url, socket] of entries) {
      const readyState = (socket as WebSocket).readyState
      this.log(`Nostr relay ${url}: ${relayReadyStateLabel(readyState)}`)
    }
  }

  private connect(): void {
    const roomId = `${this.appId}-${this.code}`

    try {
      this.room = joinRoom(
        {
          appId: this.appId,
          turnConfig: [...OPENRELAY_TURN],
          relayRedundancy: 8,
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

    this.log(`Joined Trystero room id=${roomId}`)
    window.setTimeout(() => this.logRelayStatus(), 2_000)

    const [send, receive] = this.room.makeAction('chat')
    this.sendFn = send as Sender

    receive((data: unknown) => {
      this.callbacks.onMessage(data)
    })

    this.room.onPeerJoin((peerId) => {
      this.clearGuestConnectTimer()
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
