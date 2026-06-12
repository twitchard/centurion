import type { BoardSquare, MatchState, PlayerId } from '../../core/match/model'
import type { PendingResolution } from '../../core/match/resolve'

export type SessionMode =
  | { readonly tag: 'local' }
  | { readonly tag: 'solo' }
  | {
      readonly tag: 'remote'
      readonly you: PlayerId
      readonly code: string
      readonly peerConnected: boolean
    }

export interface GameReplayState {
  readonly gameId: number
  readonly ply: number
}

/**
 * The solo opponent's pending trap arrow: the ids of the games whose
 * worst moves are being computed, aligned with the FENs sent to the
 * engine. Input is blocked until the arrow lands, like `resolving`.
 */
export interface TrapPending {
  readonly gameIds: readonly number[]
}

export interface MatchSession {
  readonly mode: SessionMode
  readonly match: MatchState
  /** Non-null while Stockfish is computing this turn's fallback moves. */
  readonly resolving: PendingResolution | null
  /** Non-null while the solo opponent's trap arrow is being computed. */
  readonly trap: TrapPending | null
  readonly selectedSquare: BoardSquare | null
  readonly arrowInput: string
  readonly inputError: string | null
  readonly notice: string | null
  /** Set when the match ends so the user can step through a finished game. */
  readonly gameReplay: GameReplayState | null
}

export type CenturionModel =
  | {
      readonly tag: 'lobby'
      readonly joinCodeInput: string
      readonly notice: string | null
    }
  | {
      readonly tag: 'connecting'
      readonly role: 'host' | 'guest'
      readonly code: string
    }
  | {
      readonly tag: 'waiting'
      readonly code: string
      readonly pendingSeed: number
      readonly notice: string | null
    }
  | { readonly tag: 'syncing'; readonly code: string }
  | { readonly tag: 'playing'; readonly session: MatchSession }

export function initCenturionModel(): CenturionModel {
  return { tag: 'lobby', joinCodeInput: '', notice: null }
}

export function sessionViewer(session: MatchSession): PlayerId {
  return session.mode.tag === 'remote' ? session.mode.you : 1
}
