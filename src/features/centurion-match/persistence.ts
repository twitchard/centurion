import {
  type MatchSnapshot,
  decodeMatchSnapshot,
  encodeMatchState,
} from '../../core/match/snapshot'
import type {
  CenturionModel,
  GameReplayState,
  MatchSession,
  SessionMode,
} from './model'

export const CENTURION_PERSISTENCE_KEY = 'centurion-chess-session-v1'
export const CENTURION_PERSISTENCE_VERSION = 1

export const RESTORED_SESSION_COPY =
  'Restored your in-progress match from this device.'

export interface PersistedMatchSession {
  readonly mode: SessionMode
  readonly match: MatchSnapshot
  readonly selectedSquare: number | null
  readonly arrowInput: string
  readonly gameReplay: GameReplayState | null
}

export type PersistedCenturion =
  | {
      readonly v: typeof CENTURION_PERSISTENCE_VERSION
      readonly tag: 'waiting'
      readonly code: string
      readonly pendingSeed: number
    }
  | {
      readonly v: typeof CENTURION_PERSISTENCE_VERSION
      readonly tag: 'syncing'
      readonly code: string
    }
  | {
      readonly v: typeof CENTURION_PERSISTENCE_VERSION
      readonly tag: 'playing'
      readonly session: PersistedMatchSession
    }

export function encodeSessionForPersistence(
  session: MatchSession,
): PersistedMatchSession | null {
  if (session.resolving !== null) {
    return null
  }
  return {
    mode: session.mode,
    match: encodeMatchState(session.match),
    selectedSquare: session.selectedSquare,
    arrowInput: session.arrowInput,
    gameReplay: session.gameReplay,
  }
}

export function decodePersistedSession(
  persisted: PersistedMatchSession,
  notice: string | null = RESTORED_SESSION_COPY,
): MatchSession | null {
  const match = decodeMatchSnapshot(persisted.match)
  if (match === null) {
    return null
  }
  return {
    mode: persisted.mode,
    match,
    resolving: null,
    selectedSquare: persisted.selectedSquare,
    arrowInput: persisted.arrowInput,
    inputError: null,
    notice,
    gameReplay: persisted.gameReplay,
  }
}

export function encodeCenturionForPersistence(
  model: CenturionModel,
): PersistedCenturion | null {
  switch (model.tag) {
    case 'waiting':
      return {
        v: CENTURION_PERSISTENCE_VERSION,
        tag: 'waiting',
        code: model.code,
        pendingSeed: model.pendingSeed,
      }
    case 'syncing':
      return {
        v: CENTURION_PERSISTENCE_VERSION,
        tag: 'syncing',
        code: model.code,
      }
    case 'playing': {
      const session = encodeSessionForPersistence(model.session)
      if (session === null) {
        return null
      }
      return {
        v: CENTURION_PERSISTENCE_VERSION,
        tag: 'playing',
        session,
      }
    }
    default:
      return null
  }
}

function isPersistedMatchSession(
  value: unknown,
): value is PersistedMatchSession {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const session = value as PersistedMatchSession
  return (
    typeof session.mode === 'object' &&
    session.mode !== null &&
    typeof session.match === 'object' &&
    session.match !== null &&
    (session.selectedSquare === null ||
      typeof session.selectedSquare === 'number') &&
    typeof session.arrowInput === 'string' &&
    (session.gameReplay === null ||
      (typeof session.gameReplay === 'object' &&
        typeof session.gameReplay.gameId === 'number' &&
        typeof session.gameReplay.ply === 'number'))
  )
}

export function decodePersistedCenturion(
  value: unknown,
): PersistedCenturion | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const raw = value as PersistedCenturion
  if (raw.v !== CENTURION_PERSISTENCE_VERSION) {
    return null
  }
  if (raw.tag === 'waiting') {
    if (typeof raw.code !== 'string' || typeof raw.pendingSeed !== 'number') {
      return null
    }
    return raw
  }
  if (raw.tag === 'syncing') {
    if (typeof raw.code !== 'string') {
      return null
    }
    return raw
  }
  if (raw.tag === 'playing') {
    if (!isPersistedMatchSession(raw.session)) {
      return null
    }
    if (decodeMatchSnapshot(raw.session.match) === null) {
      return null
    }
    return raw
  }
  return null
}

export function centurionModelFromPersistence(
  persisted: PersistedCenturion,
): CenturionModel | null {
  switch (persisted.tag) {
    case 'waiting':
      return {
        tag: 'waiting',
        code: persisted.code,
        pendingSeed: persisted.pendingSeed >>> 0,
        notice: RESTORED_SESSION_COPY,
      }
    case 'syncing':
      return { tag: 'syncing', code: persisted.code }
    case 'playing': {
      const session = decodePersistedSession(persisted.session)
      if (session === null) {
        return null
      }
      return { tag: 'playing', session }
    }
    default:
      return null
  }
}
