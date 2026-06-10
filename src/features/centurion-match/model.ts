import type { BoardSquare, MatchState, PlayerId } from '../../core/match/model'

export type SessionMode =
  | { readonly tag: 'local' }
  | {
      readonly tag: 'remote'
      readonly you: PlayerId
      readonly code: string
      readonly peerConnected: boolean
    }

export interface MatchSession {
  readonly mode: SessionMode
  readonly match: MatchState
  readonly selectedSquare: BoardSquare | null
  readonly arrowInput: string
  readonly inputError: string | null
  readonly notice: string | null
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
  | { readonly tag: 'waiting'; readonly code: string }
  | { readonly tag: 'syncing'; readonly code: string }
  | { readonly tag: 'playing'; readonly session: MatchSession }

export function initCenturionModel(): CenturionModel {
  return { tag: 'lobby', joinCodeInput: '', notice: null }
}

export function sessionViewer(session: MatchSession): PlayerId {
  return session.mode.tag === 'remote' ? session.mode.you : 1
}
