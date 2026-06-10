export type TransportStatus =
  | 'disconnected'
  | 'connecting'
  | 'waiting'
  | 'connected'
  | 'error'

export interface TransportCallbacks {
  readonly onStatusChange: (status: TransportStatus) => void
  readonly onPeerJoin: () => void
  readonly onPeerLeave: () => void
  readonly onMessage: (data: unknown) => void
  readonly onLog?: (message: string) => void
}

export interface TransportPort {
  readonly status: TransportStatus
  readonly code: string
  readonly isHost: boolean
  createRoom(): string
  joinRoom(code: string): void
  send(data: unknown): void
  disconnect(): void
  setCallbacks(callbacks: TransportCallbacks): void
}

export const NOOP_TRANSPORT_CALLBACKS: TransportCallbacks = {
  onStatusChange: () => {},
  onPeerJoin: () => {},
  onPeerLeave: () => {},
  onMessage: () => {},
}
