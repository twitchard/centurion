export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'waiting' // host waiting for guest
  | 'connected'
  | 'error'

export interface RoomInfo {
  code: string
  isHost: boolean
  status: ConnectionStatus
}

export interface ConnectionCallbacks {
  onStatusChange: (status: ConnectionStatus) => void
  onPeerJoin: () => void
  onPeerLeave: () => void
  onMessage: (data: unknown) => void
}
