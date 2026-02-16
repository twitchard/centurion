import { joinRoom } from 'trystero/nostr'
import {
  NOOP_TRANSPORT_CALLBACKS,
  type TransportCallbacks,
  type TransportPort,
  type TransportStatus,
} from '../ports/transport'

const DEFAULT_APP_ID = 'centurion-chess-chat-lab-v1'

type Room = ReturnType<typeof joinRoom>
type Sender = (data: unknown, targetPeers?: readonly string[]) => void

export class TrysteroTransportAdapter implements TransportPort {
  private room: Room | null = null
  private sendFn: Sender | null = null
  private callbacks: TransportCallbacks = NOOP_TRANSPORT_CALLBACKS
  private currentStatus: TransportStatus = 'disconnected'
  private readonly appId: string

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
    this.room?.leave()
    this.room = null
    this.sendFn = null
    this.currentStatus = 'disconnected'
    this.code = ''
    this.isHost = false
  }

  private setStatus(status: TransportStatus): void {
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
    }
  }

  private static generateCode(): string {
    return String(Math.floor(100_000 + Math.random() * 900_000))
  }
}
