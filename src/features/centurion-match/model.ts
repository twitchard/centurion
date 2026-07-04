import {
  type MatchState,
  type PlayerId,
  activePlacer,
} from '../../core/match/model'
import type { PendingResolution } from '../../core/match/resolve'

/** One-game solo match for verifying board controls behave like chess. */
export const PRACTICE_GAME_COUNT = 1

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
 * The turn's command while it is being submitted: typed words compile to
 * a predicate at the edge, then the turn resolves immediately.
 */
export type CommandDraft =
  | { readonly tag: 'idle' }
  | { readonly tag: 'compiling'; readonly text: string }
  | {
      readonly tag: 'failed'
      readonly text: string
      readonly message: string
    }

export interface MatchSession {
  readonly mode: SessionMode
  readonly match: MatchState
  /** Non-null while Stockfish is ranking this turn's moves. */
  readonly resolving: PendingResolution | null
  readonly commandInput: string
  readonly draft: CommandDraft
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
  /** Host: creating the room record in the database. */
  | {
      readonly tag: 'connecting-host'
      readonly code: string
      readonly seed: number
    }
  /** Guest: looking the room up in the database. */
  | { readonly tag: 'connecting-guest'; readonly code: string }
  /** Host: room open, waiting for a guest to show up. */
  | {
      readonly tag: 'waiting'
      readonly code: string
      readonly seed: number
      readonly notice: string | null
    }
  /** Guest: in the room, waiting for the host to publish the first state. */
  | { readonly tag: 'syncing'; readonly code: string }
  | { readonly tag: 'playing'; readonly session: MatchSession }

export function initCenturionModel(): CenturionModel {
  return { tag: 'lobby', joinCodeInput: '', notice: null }
}

/**
 * Whose perspective the live board uses: remote clients stay fixed on
 * their seat; pass-and-play flips with the active commander; solo is
 * always player 1 commanding white.
 */
export function sessionViewer(session: MatchSession): PlayerId {
  switch (session.mode.tag) {
    case 'remote':
      return session.mode.you
    case 'local':
      return activePlacer(session.match)
    case 'solo':
      return 1
  }
}
