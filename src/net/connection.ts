import { joinRoom } from 'trystero/nostr'
import type { ConnectionCallbacks, ConnectionStatus } from './types'

const APP_ID = 'centurion-chess-v1'

type Room = ReturnType<typeof joinRoom>

export class PeerConnection {
  private room: Room | null = null
  // biome-ignore lint/suspicious/noExplicitAny: Trystero's ActionSender type is complex
  private sendFn: ((data: any, targetPeers?: string[]) => void) | null = null
  private callbacks: ConnectionCallbacks
  private _status: ConnectionStatus = 'disconnected'
  private _peerConnected = false
  code = ''
  isHost = false

  constructor(callbacks: ConnectionCallbacks) {
    this.callbacks = callbacks
  }

  get status(): ConnectionStatus {
    return this._status
  }
  get peerConnected(): boolean {
    return this._peerConnected
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status
    this.callbacks.onStatusChange(status)
  }

  /** Generate a 6-digit room code */
  private static generateCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000))
  }

  /** Create a room as host */
  createRoom(): string {
    this.disconnect()
    this.code = PeerConnection.generateCode()
    this.isHost = true
    this.setStatus('connecting')
    this.connect()
    return this.code
  }

  /** Join a room as guest */
  joinRoom(code: string): void {
    this.disconnect()
    this.code = code
    this.isHost = false
    this.setStatus('connecting')
    this.connect()
  }

  private connect(): void {
    const roomId = `${APP_ID}-${this.code}`

    try {
      this.room = joinRoom({ appId: APP_ID }, roomId)
    } catch {
      this.setStatus('error')
      return
    }

    const [send, receive] = this.room.makeAction('game')
    this.sendFn = send

    receive((data: unknown) => {
      this.callbacks.onMessage(data)
    })

    this.room.onPeerJoin(() => {
      this._peerConnected = true
      this.setStatus('connected')
      this.callbacks.onPeerJoin()
    })

    this.room.onPeerLeave(() => {
      this._peerConnected = false
      this.setStatus('waiting')
      this.callbacks.onPeerLeave()
    })

    // If host, show waiting; if guest, we're connecting
    if (this.isHost) {
      this.setStatus('waiting')
    }
    // Guest stays in 'connecting' until onPeerJoin fires
  }

  /** Send a message to the peer */
  send(data: unknown): void {
    this.sendFn?.(data)
  }

  /** Disconnect from the room */
  disconnect(): void {
    this.room?.leave()
    this.room = null
    this.sendFn = null
    this._peerConnected = false
    this._status = 'disconnected'
    this.code = ''
  }
}
