import { joinRoom } from 'trystero/nostr'
import {
  NOOP_TRANSPORT_CALLBACKS,
  type TransportCallbacks,
  type TransportPort,
  type TransportStatus,
} from '../ports/transport'

const DEFAULT_APP_ID = 'centurion-chess-chat-lab-v1'
const DEFAULT_GUEST_CONNECT_TIMEOUT_MS = 15_000
const PEER_POLL_INTERVAL_MS = 750

type Room = ReturnType<typeof joinRoom>
type Sender = (data: unknown, targetPeers?: readonly string[]) => void

export class TrysteroTransportAdapter implements TransportPort {
  private room: Room | null = null
  private sendFn: Sender | null = null
  private callbacks: TransportCallbacks = NOOP_TRANSPORT_CALLBACKS
  private currentStatus: TransportStatus = 'disconnected'
  private readonly appId: string
  private readonly guestConnectTimeoutMs: number
  private guestConnectTimeout: ReturnType<typeof setTimeout> | null = null
  private guestPeerPoll: ReturnType<typeof setInterval> | null = null

  code = ''
  isHost = false

  constructor(
    appId: string = DEFAULT_APP_ID,
    guestConnectTimeoutMs: number = DEFAULT_GUEST_CONNECT_TIMEOUT_MS,
  ) {
    this.appId = appId
    this.guestConnectTimeoutMs = guestConnectTimeoutMs
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
    this.clearGuestConnectWatchdog()
    this.room?.leave()
    this.room = null
    this.sendFn = null
    this.currentStatus = 'disconnected'
    this.code = ''
    this.isHost = false
  }

  private setStatus(status: TransportStatus): void {
    if (status !== 'connecting') {
      this.clearGuestConnectWatchdog()
    }
    this.currentStatus = status
    this.callbacks.onStatusChange(status)
  }

  private connect(): void {
    const roomId = `${this.appId}-${this.code}`

    try {
      this.room = joinRoom({ appId: this.appId }, roomId)
    } catch (_error: unknown) {
      this.setStatus('error')
      return
    }

    const [send, receive] = this.room.makeAction('chat')
    this.sendFn = send as Sender

    receive((data: unknown) => {
      this.callbacks.onMessage(data)
    })

    this.room.onPeerJoin(() => {
      this.setStatus('connected')
      this.callbacks.onPeerJoin()
    })

    this.room.onPeerLeave(() => {
      this.setStatus(this.isHost ? 'waiting' : 'disconnected')
      this.callbacks.onPeerLeave()
    })

    if (this.isHost) {
      this.setStatus('waiting')
      return
    }

    if (this.currentStatus === 'connecting') {
      this.startGuestConnectWatchdog()
    }
  }

  private startGuestConnectWatchdog(): void {
    this.clearGuestConnectWatchdog()
    this.guestConnectTimeout = setTimeout(() => {
      if (!this.isHost && this.currentStatus === 'connecting') {
        this.setStatus('error')
      }
    }, this.guestConnectTimeoutMs)
    this.guestPeerPoll = setInterval(() => {
      if (this.currentStatus !== 'connecting' || this.room === null) {
        return
      }
      if (Object.keys(this.room.getPeers()).length > 0) {
        this.setStatus('connected')
      }
    }, PEER_POLL_INTERVAL_MS)
  }

  private clearGuestConnectWatchdog(): void {
    if (this.guestConnectTimeout !== null) {
      clearTimeout(this.guestConnectTimeout)
      this.guestConnectTimeout = null
    }
    if (this.guestPeerPoll !== null) {
      clearInterval(this.guestPeerPoll)
      this.guestPeerPoll = null
    }
  }

  private static generateCode(): string {
    return String(Math.floor(100_000 + Math.random() * 900_000))
  }
}
