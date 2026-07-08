import { tryCompileLiteralNotation } from '../../core/command/parse-notation'
import { validateCommandText } from '../../core/command/text'
import {
  COMMAND_LAST_TURN,
  type MatchState,
  activePlacer,
  canIssueCommands,
  initMatch,
} from '../../core/match/model'
import { defaultReplayGameId } from '../../core/match/pgn'
import {
  type CommandInput,
  type RankedMove,
  beginAutoResolution,
  beginResolution,
  completeResolution,
} from '../../core/match/resolve'
import {
  type MatchSnapshot,
  decodeMatchSnapshot,
  encodeMatchState,
} from '../../core/match/snapshot'
import { type UpdateResult, assertNever, noCmd } from '../../core/update'
import type { CommandCompileResult } from '../../ports/command-compiler'
import type { RoomRole } from '../../ports/match-room'
import {
  type CenturionModel,
  type MatchSession,
  PRACTICE_GAME_COUNT,
  initCenturionModel,
} from './model'
import {
  type PersistedCenturion,
  centurionModelFromPersistence,
} from './persistence'

export type CenturionMsg =
  | { readonly tag: 'join-code-updated'; readonly value: string }
  | {
      readonly tag: 'new-match-requested'
      readonly seed: number
      readonly code: string
    }
  | { readonly tag: 'join-match-requested' }
  | { readonly tag: 'pass-and-play-requested'; readonly seed: number }
  | { readonly tag: 'solo-requested'; readonly seed: number }
  | { readonly tag: 'practice-requested'; readonly seed: number }
  | { readonly tag: 'share-invite-requested' }
  | { readonly tag: 'copy-invite-requested' }
  | { readonly tag: 'invite-copy-succeeded' }
  | { readonly tag: 'invite-copy-failed' }
  | { readonly tag: 'command-input-updated'; readonly value: string }
  | {
      readonly tag: 'command-compile-finished'
      readonly text: string
      readonly result: CommandCompileResult
    }
  | { readonly tag: 'command-issue-requested' }
  | { readonly tag: 'pass-requested' }
  | {
      readonly tag: 'ranked-moves-computed'
      readonly ranked: readonly (readonly RankedMove[])[]
    }
  | { readonly tag: 'ranked-moves-failed'; readonly message: string }
  | { readonly tag: 'leave-session-requested' }
  | { readonly tag: 'room-opened' }
  | { readonly tag: 'room-error'; readonly message: string }
  | { readonly tag: 'room-peer-presence'; readonly present: boolean }
  | { readonly tag: 'room-state-received'; readonly state: unknown }
  | {
      readonly tag: 'restore-session-requested'
      readonly persisted: PersistedCenturion
    }
  | { readonly tag: 'game-replay-game-selected'; readonly gameId: number }
  | {
      readonly tag: 'game-replay-step'
      readonly step: 'start' | 'prev' | 'next' | 'end'
    }

export type CenturionCmd =
  | {
      readonly tag: 'room-open'
      readonly code: string
      readonly role: RoomRole
      readonly seed?: number
    }
  | { readonly tag: 'room-publish'; readonly state: MatchSnapshot }
  | { readonly tag: 'room-leave' }
  | { readonly tag: 'compile-command'; readonly text: string }
  | {
      readonly tag: 'compute-ranked-moves'
      readonly fens: readonly string[]
    }
  | { readonly tag: 'share-invite'; readonly code: string }
  | { readonly tag: 'copy-invite'; readonly code: string }

const INVALID_JOIN_CODE_COPY = 'Enter a valid 6-digit match code.'
const NOT_YOUR_TURN_COPY = 'Waiting for your opponent to issue a command.'
const PLAYOUT_PHASE_COPY = `Turn ${COMMAND_LAST_TURN} has passed; the soldiers are playing out the remaining games.`
const RESOLVING_COPY = 'The soldiers are resolving the turn...'

function sanitizeJoinCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6)
}

function playing(session: MatchSession): CenturionModel {
  return { tag: 'playing', session }
}

function withSession(
  model: { readonly session: MatchSession },
  patch: Partial<MatchSession>,
): CenturionModel {
  return playing({ ...model.session, ...patch })
}

function startSession(
  match: MatchState,
  mode: MatchSession['mode'],
): MatchSession {
  return {
    mode,
    match,
    resolving: null,
    commandInput: '',
    draft: { tag: 'idle' },
    inputError: null,
    notice: null,
    gameReplay: null,
  }
}

function withFinishedReplay(
  session: MatchSession,
  match: MatchState,
): MatchSession {
  const next = { ...session, match, resolving: null }
  if (match.phase.tag !== 'finished' || next.gameReplay !== null) {
    return next
  }
  return {
    ...next,
    gameReplay: { gameId: defaultReplayGameId(match.games), ply: 0 },
  }
}

function clampReplayPly(moveCount: number, ply: number): number {
  return Math.max(0, Math.min(ply, moveCount))
}

function roomRejoinCommands(model: CenturionModel): readonly CenturionCmd[] {
  switch (model.tag) {
    case 'waiting':
      return [
        { tag: 'room-open', code: model.code, role: 'host', seed: model.seed },
      ]
    case 'playing': {
      const mode = model.session.mode
      if (mode.tag !== 'remote') {
        return []
      }
      const role: RoomRole = mode.you === 1 ? 'host' : 'guest'
      return [{ tag: 'room-open', code: mode.code, role }]
    }
    default:
      return []
  }
}

function isPlayoutPhase(match: MatchState): boolean {
  return match.turn > COMMAND_LAST_TURN
}

/**
 * The room holds the authoritative state: after every locally resolved
 * turn the new snapshot is published wholesale. The opponent adopts it
 * verbatim, so the two clients can never diverge.
 */
function publishCommands(
  session: MatchSession,
  match: MatchState,
): readonly CenturionCmd[] {
  if (session.mode.tag !== 'remote') {
    return []
  }
  return [{ tag: 'room-publish', state: encodeMatchState(match) }]
}

function commanderIsYou(session: MatchSession): boolean {
  if (session.mode.tag !== 'remote') {
    return true
  }
  return activePlacer(session.match) === session.mode.you
}

function shouldChainAutoResolution(
  session: MatchSession,
  match: MatchState,
): boolean {
  if (match.phase.tag === 'finished') {
    return false
  }
  if (isPlayoutPhase(match)) {
    return true
  }
  // Solo: the player commands white; black's half-turns play unled.
  return session.mode.tag === 'solo' && match.turn % 2 === 0
}

/**
 * Kick off an unled ply: every game gets a ranked search and the
 * soldiers sample their own moves.
 */
function driveAutoResolution(
  session: MatchSession,
): UpdateResult<CenturionModel, CenturionCmd> {
  const resolution = beginAutoResolution(session.match)
  if (resolution === null) {
    return noCmd(playing(session))
  }
  return [
    playing({ ...session, resolving: resolution, inputError: null }),
    [
      {
        tag: 'compute-ranked-moves',
        fens: resolution.pending.map((entry) => entry.fen),
      },
    ],
  ]
}

/**
 * A turn just resolved locally. Publish the settled state to the room
 * (remote mode), then keep the match moving: in solo mode the black
 * half-turn auto-plays unled; after turn 100 every ply auto-plays,
 * driven by whichever remote player is the active commander.
 */
function continueAfterResolution(
  session: MatchSession,
  match: MatchState,
): UpdateResult<CenturionModel, CenturionCmd> {
  const publish = publishCommands(session, match)
  const settled = withFinishedReplay(session, match)
  const [model, commands] = continueSettledSession(settled, match)
  return [model, [...publish, ...commands]]
}

function continueSettledSession(
  settled: MatchSession,
  match: MatchState,
): UpdateResult<CenturionModel, CenturionCmd> {
  if (!shouldChainAutoResolution(settled, match)) {
    return noCmd(playing(settled))
  }
  if (
    isPlayoutPhase(match) &&
    settled.mode.tag === 'remote' &&
    !commanderIsYou(settled)
  ) {
    return noCmd(playing(settled))
  }
  return driveAutoResolution(settled)
}

/**
 * Adopt a state published by the opponent. If the soldier playout after
 * turn 100 is now ours to drive, keep it moving; publishing happens when
 * our own resolution completes.
 */
function adoptRemoteState(
  session: MatchSession,
  match: MatchState,
): UpdateResult<CenturionModel, CenturionCmd> {
  const settled = withFinishedReplay({ ...session, inputError: null }, match)
  if (
    match.phase.tag === 'active' &&
    isPlayoutPhase(match) &&
    commanderIsYou(settled)
  ) {
    return driveAutoResolution(settled)
  }
  return noCmd(playing(settled))
}

/** Guards shared by compiling, issuing, and passing. */
function turnActionError(session: MatchSession): string | null {
  if (session.match.phase.tag === 'finished') {
    return 'The match is over.'
  }
  if (session.resolving !== null) {
    return RESOLVING_COPY
  }
  if (!canIssueCommands(session.match)) {
    return PLAYOUT_PHASE_COPY
  }
  if (!commanderIsYou(session)) {
    return NOT_YOUR_TURN_COPY
  }
  return null
}

function issueTurn(
  session: MatchSession,
  command: CommandInput | null,
): UpdateResult<CenturionModel, CenturionCmd> {
  const resolution = beginResolution(session.match, command)
  if (resolution === null) {
    return noCmd(playing(session))
  }
  return [
    playing({
      ...session,
      resolving: resolution,
      commandInput: '',
      draft: { tag: 'idle' },
      inputError: null,
    }),
    [
      {
        tag: 'compute-ranked-moves',
        fens: resolution.pending.map((entry) => entry.fen),
      },
    ],
  ]
}

export function updateCenturion(
  model: CenturionModel,
  msg: CenturionMsg,
): UpdateResult<CenturionModel, CenturionCmd> {
  switch (msg.tag) {
    case 'join-code-updated': {
      if (model.tag !== 'lobby') {
        return noCmd(model)
      }
      return noCmd({ ...model, joinCodeInput: sanitizeJoinCode(msg.value) })
    }

    case 'new-match-requested': {
      if (model.tag !== 'lobby') {
        return noCmd(model)
      }
      const seed = msg.seed >>> 0
      return [
        { tag: 'connecting-host', code: msg.code, seed },
        [{ tag: 'room-open', code: msg.code, role: 'host', seed }],
      ]
    }

    case 'join-match-requested': {
      if (model.tag !== 'lobby') {
        return noCmd(model)
      }
      const code = sanitizeJoinCode(model.joinCodeInput)
      if (code.length !== 6) {
        return noCmd({ ...model, notice: INVALID_JOIN_CODE_COPY })
      }
      return [
        { tag: 'connecting-guest', code },
        [{ tag: 'room-open', code, role: 'guest' }],
      ]
    }

    case 'pass-and-play-requested': {
      if (model.tag !== 'lobby') {
        return noCmd(model)
      }
      return noCmd(playing(startSession(initMatch(msg.seed), { tag: 'local' })))
    }

    case 'solo-requested': {
      if (model.tag !== 'lobby') {
        return noCmd(model)
      }
      // You are always player 1 (gold) and own white: you command each
      // white half-turn; black's soldiers play unled.
      const match = initMatch(msg.seed, { firstPlacer: 1, whitePlayer: 1 })
      return noCmd(playing(startSession(match, { tag: 'solo' })))
    }

    case 'practice-requested': {
      if (model.tag !== 'lobby') {
        return noCmd(model)
      }
      const match = initMatch(msg.seed, {
        gameCount: PRACTICE_GAME_COUNT,
        firstPlacer: 1,
        whitePlayer: 1,
      })
      return noCmd(playing(startSession(match, { tag: 'solo' })))
    }

    case 'share-invite-requested': {
      if (model.tag !== 'waiting') {
        return noCmd(model)
      }
      return [model, [{ tag: 'share-invite', code: model.code }]]
    }

    case 'copy-invite-requested': {
      if (model.tag !== 'waiting') {
        return noCmd(model)
      }
      return [model, [{ tag: 'copy-invite', code: model.code }]]
    }

    case 'invite-copy-succeeded': {
      if (model.tag !== 'waiting') {
        return noCmd(model)
      }
      return noCmd({ ...model, notice: 'Invite link copied.' })
    }

    case 'invite-copy-failed': {
      if (model.tag !== 'waiting') {
        return noCmd(model)
      }
      return noCmd({
        ...model,
        notice: 'Could not copy the link - share the code instead.',
      })
    }

    case 'command-input-updated': {
      if (model.tag !== 'playing') {
        return noCmd(model)
      }
      // Editing the text invalidates any in-flight submit.
      return noCmd(
        withSession(model, {
          commandInput: msg.value,
          draft: { tag: 'idle' },
          inputError: null,
        }),
      )
    }

    case 'command-issue-requested': {
      if (model.tag !== 'playing') {
        return noCmd(model)
      }
      const session = model.session
      const error = turnActionError(session)
      if (error !== null) {
        return noCmd(withSession(model, { inputError: error }))
      }
      if (session.draft.tag === 'compiling') {
        return noCmd(model)
      }
      const validated = validateCommandText(session.commandInput)
      if (validated.tag === 'invalid') {
        return noCmd(
          withSession(model, {
            inputError: validated.diagnostics.join(' '),
          }),
        )
      }
      // Literal notation compiles locally: no network, no LLM round-trip.
      const literal = tryCompileLiteralNotation(validated.value)
      if (literal !== null) {
        return issueTurn(session, {
          text: validated.value,
          predicate: literal,
        })
      }
      return [
        withSession(model, {
          draft: { tag: 'compiling', text: validated.value },
          inputError: null,
        }),
        [{ tag: 'compile-command', text: validated.value }],
      ]
    }

    case 'command-compile-finished': {
      if (model.tag !== 'playing') {
        return noCmd(model)
      }
      const draft = model.session.draft
      if (draft.tag !== 'compiling' || draft.text !== msg.text) {
        // Stale response: the input changed or the session moved on.
        return noCmd(model)
      }
      if (msg.result.tag === 'failed') {
        return noCmd(
          withSession(model, {
            draft: {
              tag: 'failed',
              text: msg.text,
              message: msg.result.message,
            },
          }),
        )
      }
      return issueTurn(model.session, {
        text: msg.text,
        predicate: msg.result.predicate,
      })
    }

    case 'pass-requested': {
      if (model.tag !== 'playing') {
        return noCmd(model)
      }
      const session = model.session
      const error = turnActionError(session)
      if (error !== null) {
        return noCmd(withSession(model, { inputError: error }))
      }
      return issueTurn(session, null)
    }

    case 'ranked-moves-computed': {
      if (model.tag !== 'playing') {
        return noCmd(model)
      }
      const session = model.session
      const resolution = session.resolving
      if (resolution === null) {
        return noCmd(model)
      }
      const match = completeResolution(resolution, msg.ranked)
      if (match === null) {
        return noCmd(
          withSession(model, {
            resolving: null,
            notice: 'Stockfish returned unusable rankings; turn abandoned.',
          }),
        )
      }
      return continueAfterResolution(session, match)
    }

    case 'ranked-moves-failed': {
      if (model.tag !== 'playing' || model.session.resolving === null) {
        return noCmd(model)
      }
      return noCmd(
        withSession(model, {
          resolving: null,
          notice: `Engine error: ${msg.message} Turn abandoned; try again.`,
        }),
      )
    }

    case 'leave-session-requested': {
      const needsLeave =
        model.tag === 'connecting-host' ||
        model.tag === 'connecting-guest' ||
        model.tag === 'waiting' ||
        model.tag === 'syncing' ||
        (model.tag === 'playing' && model.session.mode.tag === 'remote')
      return [initCenturionModel(), needsLeave ? [{ tag: 'room-leave' }] : []]
    }

    case 'room-opened': {
      if (model.tag === 'connecting-host') {
        return noCmd({
          tag: 'waiting',
          code: model.code,
          seed: model.seed,
          notice: null,
        })
      }
      if (model.tag === 'connecting-guest') {
        return noCmd({ tag: 'syncing', code: model.code })
      }
      // Re-opening after a restore: already in the right state.
      return noCmd(model)
    }

    case 'room-error': {
      switch (model.tag) {
        case 'connecting-host':
        case 'connecting-guest':
        case 'waiting':
        case 'syncing':
          return [
            { tag: 'lobby', joinCodeInput: '', notice: msg.message },
            [{ tag: 'room-leave' }],
          ]
        case 'playing':
          if (model.session.mode.tag !== 'remote') {
            return noCmd(model)
          }
          return noCmd(withSession(model, { notice: msg.message }))
        default:
          return noCmd(model)
      }
    }

    case 'room-peer-presence': {
      if (model.tag === 'waiting') {
        if (!msg.present) {
          return noCmd(model)
        }
        // The guest arrived: the host initialises the match and
        // publishes the first snapshot; the guest adopts it.
        const match = initMatch(model.seed)
        const session = startSession(match, {
          tag: 'remote',
          you: 1,
          code: model.code,
          peerConnected: true,
        })
        return [playing(session), publishCommands(session, match)]
      }
      if (model.tag === 'playing' && model.session.mode.tag === 'remote') {
        const mode = model.session.mode
        if (mode.peerConnected === msg.present) {
          return noCmd(model)
        }
        return noCmd(
          withSession(model, {
            mode: { ...mode, peerConnected: msg.present },
            notice: msg.present
              ? 'Opponent reconnected.'
              : 'Opponent disconnected.',
          }),
        )
      }
      return noCmd(model)
    }

    case 'room-state-received': {
      const match = decodeMatchSnapshot(msg.state)
      if (match === null) {
        return noCmd(model)
      }
      // A guest can hear the room's existing state (an in-progress match
      // being rejoined) before or after the open acknowledgement.
      if (model.tag === 'syncing' || model.tag === 'connecting-guest') {
        const session = startSession(match, {
          tag: 'remote',
          you: 2,
          code: model.code,
          peerConnected: true,
        })
        return adoptRemoteState(session, match)
      }
      if (model.tag !== 'playing' || model.session.mode.tag !== 'remote') {
        return noCmd(model)
      }
      // Adopt only states that advance the match: everything else is the
      // echo of our own publish (or stale).
      if (match.turn <= model.session.match.turn) {
        return noCmd(model)
      }
      return adoptRemoteState(model.session, match)
    }

    case 'restore-session-requested': {
      const restored = centurionModelFromPersistence(msg.persisted)
      if (restored === null) {
        return noCmd(model)
      }
      return [restored, roomRejoinCommands(restored)]
    }

    case 'game-replay-game-selected': {
      if (model.tag !== 'playing') {
        return noCmd(model)
      }
      const session = model.session
      if (session.match.phase.tag !== 'finished') {
        return noCmd(model)
      }
      const game = session.match.games.find((entry) => entry.id === msg.gameId)
      if (game === undefined) {
        return noCmd(model)
      }
      return noCmd(
        withSession(model, {
          gameReplay: { gameId: game.id, ply: 0 },
        }),
      )
    }

    case 'game-replay-step': {
      if (model.tag !== 'playing') {
        return noCmd(model)
      }
      const session = model.session
      const replay = session.gameReplay
      if (replay === null || session.match.phase.tag !== 'finished') {
        return noCmd(model)
      }
      const game = session.match.games.find(
        (entry) => entry.id === replay.gameId,
      )
      if (game === undefined) {
        return noCmd(model)
      }
      let ply = replay.ply
      switch (msg.step) {
        case 'start':
          ply = 0
          break
        case 'prev':
          ply -= 1
          break
        case 'next':
          ply += 1
          break
        case 'end':
          ply = game.moves.length
          break
        default:
          return assertNever(msg.step)
      }
      return noCmd(
        withSession(model, {
          gameReplay: {
            gameId: replay.gameId,
            ply: clampReplayPly(game.moves.length, ply),
          },
        }),
      )
    }

    default:
      return assertNever(msg)
  }
}
