export type PlayerNumber = 1 | 2
export type ViewMode = 'all' | 'white' | 'black'
export type GameMode = 'pass-and-play' | 'online-host' | 'online-guest'

export interface BoardCoord {
  col: number
  row: number
}

export interface Arrow {
  fc: number
  fr: number
  tc: number
  tr: number
  player: PlayerNumber
  stack: number
}

export interface ResolvedMove {
  gameIndex: number
  from: number
  to: number
}

export interface MatchResult {
  scores: [number, number]
  gamesPlayed: number
}

export interface MatchCallbacks {
  onStateChange: () => void
  onResolving: (message: string) => void
  onResolved: () => void
  onGameOver: (result: MatchResult) => void
  onSendMessage?: (message: NetMessage) => void
}

/** Network messages exchanged between host and guest */
export type NetMessage =
  | { type: 'arrow'; fc: number; fr: number; tc: number; tr: number }
  | { type: 'pass' }
  | { type: 'resolved'; moves: ResolvedMove[] }
  | { type: 'init'; firstPlayer: PlayerNumber }
  | { type: 'rematch' }
