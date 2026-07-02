import {
  ARROW_PLACEMENT_LAST_TURN,
  type Arrow,
  type BoardSquare,
  type MatchGame,
  type MatchState,
  type PlayerId,
  activePlacer,
  addBoardArrow,
  canPlaceArrows,
  initMatch,
} from '../../core/match/model'
import { defaultReplayGameId } from '../../core/match/pgn'
import { toCanonicalSquare } from '../../core/match/render'
import {
  beginAutoResolution,
  beginResolution,
  completeResolution,
} from '../../core/match/resolve'
import {
  type MatchSnapshot,
  decodeMatchSnapshot,
  encodeMatchState,
} from '../../core/match/snapshot'
import { chooseTrapArrow, trapTargets } from '../../core/match/trap'
import { parseArrowList } from '../../core/superposition/parse-arrow-list'
import { type UpdateResult, assertNever, noCmd } from '../../core/update'
import type { RoomRole } from '../../ports/match-room'
import {
  type CenturionModel,
  type MatchSession,
  initCenturionModel,
  sessionViewer,
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
  | { readonly tag: 'share-invite-requested' }
  | { readonly tag: 'copy-invite-requested' }
  | { readonly tag: 'invite-copy-succeeded' }
  | { readonly tag: 'invite-copy-failed' }
  | { readonly tag: 'board-square-clicked'; readonly square: BoardSquare }
  | { readonly tag: 'arrow-input-updated'; readonly value: string }
  | { readonly tag: 'arrow-submit-requested' }
  | {
      readonly tag: 'engine-moves-computed'
      readonly moves: readonly string[]
    }
  | { readonly tag: 'engine-moves-failed'; readonly message: string }
  | {
      readonly tag: 'worst-moves-computed'
      readonly moves: readonly string[]
    }
  | { readonly tag: 'worst-moves-failed'; readonly message: string }
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
  | {
      readonly tag: 'compute-engine-moves'
      readonly fens: readonly string[]
    }
  | {
      readonly tag: 'compute-worst-moves'
      readonly fens: readonly string[]
    }
  | { readonly tag: 'share-invite'; readonly code: string }
  | { readonly tag: 'copy-invite'; readonly code: string }

const INVALID_JOIN_CODE_COPY = 'Enter a valid 6-digit match code.'
const NOT_YOUR_TURN_COPY = 'Waiting for your opponent to place an arrow.'
const ARROWLESS_PHASE_COPY =
  'Turn 100 has passed; Stockfish is playing out the remaining games.'
const RESOLVING_COPY = 'Stockfish is resolving the turn...'
const TRAP_COPY = 'Computer is placing its trap arrow...'

/** In solo mode the human is always player 1; the Centurion is player 2. */
const SOLO_OPPONENT: PlayerId = 2

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
    trap: null,
    selectedSquare: null,
    arrowInput: '',
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

function isArrowlessPhase(match: MatchState): boolean {
  return match.turn > ARROW_PLACEMENT_LAST_TURN
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

function placerIsYou(session: MatchSession): boolean {
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
  if (isArrowlessPhase(match)) {
    return true
  }
  return session.mode.tag === 'solo' && match.turn % 2 === 0
}

function driveAutoResolution(
  session: MatchSession,
): UpdateResult<CenturionModel, CenturionCmd> {
  const resolution = beginAutoResolution(session.match)
  if (resolution === null) {
    return noCmd(playing(session))
  }
  if (resolution.pending.length === 0) {
    const match = completeResolution(resolution, [])
    if (match === null) {
      return noCmd(playing(session))
    }
    return continueAfterResolution(session, match)
  }
  return [
    playing({
      ...session,
      resolving: resolution,
      selectedSquare: null,
      inputError: null,
    }),
    [
      {
        tag: 'compute-engine-moves',
        fens: resolution.pending.map((entry) => entry.fen),
      },
    ],
  ]
}

/**
 * Solo mode's opponent. Once the black half-turn settles, the Centurion
 * studies the positions the player is about to face and lays a trap: an
 * arrow on the move Stockfish ranks worst in a plurality of the games.
 * The arrow is a white move, so it pulls nothing on the Centurion's own
 * half-turns; it lies in wait to drag the player's games into the
 * blunder, racing the player's newer (and therefore higher-priority)
 * arrows.
 */
function beginTrapPlacement(
  session: MatchSession,
): UpdateResult<CenturionModel, CenturionCmd> {
  const match = session.match
  if (
    session.mode.tag !== 'solo' ||
    match.turn % 2 !== 1 ||
    match.turn === 1 ||
    !canPlaceArrows(match)
  ) {
    return noCmd(playing(session))
  }
  const targets = trapTargets(match)
  if (targets.gameIds.length === 0) {
    return noCmd(playing(session))
  }
  return [
    playing({ ...session, trap: { gameIds: targets.gameIds } }),
    [{ tag: 'compute-worst-moves', fens: targets.fens }],
  ]
}

/**
 * A turn just resolved locally. Publish the settled state to the room
 * (remote mode), then keep the match moving: in solo mode the black
 * half-turn auto-plays and the Centurion places its trap arrow; after
 * turn 100 every ply auto-plays, driven by whichever remote player is
 * the active placer.
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
    return beginTrapPlacement(settled)
  }
  if (
    isArrowlessPhase(match) &&
    settled.mode.tag === 'remote' &&
    !placerIsYou(settled)
  ) {
    return noCmd(playing(settled))
  }
  return driveAutoResolution(settled)
}

/**
 * Adopt a state published by the opponent. If the engine playout after
 * turn 100 is now ours to drive, keep it moving; publishing happens when
 * our own resolution completes.
 */
function adoptRemoteState(
  session: MatchSession,
  match: MatchState,
): UpdateResult<CenturionModel, CenturionCmd> {
  const settled = withFinishedReplay(
    { ...session, selectedSquare: null, inputError: null },
    match,
  )
  if (
    match.phase.tag === 'active' &&
    isArrowlessPhase(match) &&
    placerIsYou(settled)
  ) {
    return driveAutoResolution(settled)
  }
  return noCmd(playing(settled))
}

function submitArrow(
  session: MatchSession,
  visualFrom: BoardSquare,
  visualTo: BoardSquare,
): UpdateResult<CenturionModel, CenturionCmd> {
  if (
    session.match.phase.tag === 'finished' ||
    session.resolving !== null ||
    session.trap !== null
  ) {
    return noCmd(playing(session))
  }
  if (!canPlaceArrows(session.match)) {
    return noCmd(
      playing({
        ...session,
        selectedSquare: null,
        inputError: ARROWLESS_PHASE_COPY,
      }),
    )
  }
  if (!placerIsYou(session)) {
    return noCmd(
      playing({
        ...session,
        selectedSquare: null,
        inputError: NOT_YOUR_TURN_COPY,
      }),
    )
  }

  const viewer = sessionViewer(session)
  const arrow: Arrow = {
    from: toCanonicalSquare(viewer, visualFrom),
    to: toCanonicalSquare(viewer, visualTo),
  }
  const resolution = beginResolution(session.match, arrow)
  if (resolution === null) {
    return noCmd(playing(session))
  }
  const cleared: MatchSession = {
    ...session,
    selectedSquare: null,
    arrowInput: '',
    inputError: null,
  }

  if (resolution.pending.length === 0) {
    // Every game advanced by an arrow; no engine moves needed.
    const match = completeResolution(resolution, [])
    if (match === null) {
      return noCmd(playing(session))
    }
    return continueAfterResolution(cleared, match)
  }

  return [
    playing({ ...cleared, resolving: resolution }),
    [
      {
        tag: 'compute-engine-moves',
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
      // You are always player 1 (gold) and own white: you arrow each
      // white half-turn, the black half-turn auto-plays, and the
      // Centurion (player 2) answers with a trap arrow.
      const match = initMatch(msg.seed, { firstPlacer: 1, whitePlayer: 1 })
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

    case 'board-square-clicked': {
      if (model.tag !== 'playing') {
        return noCmd(model)
      }
      const session = model.session
      if (session.match.phase.tag === 'finished') {
        return noCmd(model)
      }
      if (session.resolving !== null || session.trap !== null) {
        return noCmd(model)
      }
      if (!canPlaceArrows(session.match)) {
        return noCmd(model)
      }
      if (!placerIsYou(session)) {
        return noCmd(withSession(model, { inputError: NOT_YOUR_TURN_COPY }))
      }
      if (session.selectedSquare === null) {
        return noCmd(
          withSession(model, { selectedSquare: msg.square, inputError: null }),
        )
      }
      if (session.selectedSquare === msg.square) {
        return noCmd(withSession(model, { selectedSquare: null }))
      }
      return submitArrow(session, session.selectedSquare, msg.square)
    }

    case 'arrow-input-updated': {
      if (model.tag !== 'playing') {
        return noCmd(model)
      }
      return noCmd(
        withSession(model, { arrowInput: msg.value, inputError: null }),
      )
    }

    case 'arrow-submit-requested': {
      if (model.tag !== 'playing') {
        return noCmd(model)
      }
      const session = model.session
      if (session.resolving !== null) {
        return noCmd(withSession(model, { inputError: RESOLVING_COPY }))
      }
      if (session.trap !== null) {
        return noCmd(withSession(model, { inputError: TRAP_COPY }))
      }
      if (!canPlaceArrows(session.match)) {
        return noCmd(withSession(model, { inputError: ARROWLESS_PHASE_COPY }))
      }
      const input = session.arrowInput.trim()
      if (input.length === 0) {
        return noCmd(
          withSession(model, { inputError: 'Enter an arrow like "e2->e4"' }),
        )
      }
      const parsed = parseArrowList(input)
      if (parsed.tag === 'invalid') {
        return noCmd(
          withSession(model, {
            inputError: parsed.diagnostics[0] ?? 'Invalid arrow notation',
          }),
        )
      }
      const [arrow] = parsed.value
      if (arrow === undefined || parsed.value.length !== 1) {
        return noCmd(
          withSession(model, {
            inputError: 'Enter exactly one arrow per turn',
          }),
        )
      }
      const visualFrom = arrow.from.row * 8 + arrow.from.col
      const visualTo = arrow.to.row * 8 + arrow.to.col
      return submitArrow(session, visualFrom, visualTo)
    }

    case 'engine-moves-computed': {
      if (model.tag !== 'playing') {
        return noCmd(model)
      }
      const session = model.session
      const resolution = session.resolving
      if (resolution === null) {
        return noCmd(model)
      }
      const match = completeResolution(resolution, msg.moves)
      if (match === null) {
        return noCmd(
          withSession(model, {
            resolving: null,
            notice: 'Stockfish returned an unusable move; turn abandoned.',
          }),
        )
      }
      return continueAfterResolution(session, match)
    }

    case 'engine-moves-failed': {
      if (model.tag !== 'playing' || model.session.resolving === null) {
        return noCmd(model)
      }
      return noCmd(
        withSession(model, {
          resolving: null,
          notice: `Engine error: ${msg.message} Turn abandoned; place your arrow again.`,
        }),
      )
    }

    case 'worst-moves-computed': {
      if (model.tag !== 'playing') {
        return noCmd(model)
      }
      const session = model.session
      const trap = session.trap
      if (trap === null) {
        return noCmd(model)
      }
      const match = session.match
      if (msg.moves.length !== trap.gameIds.length) {
        return noCmd(withSession(model, { trap: null }))
      }
      const games: MatchGame[] = []
      for (const gameId of trap.gameIds) {
        const game = match.games.find((entry) => entry.id === gameId)
        if (game === undefined) {
          return noCmd(withSession(model, { trap: null }))
        }
        games.push(game)
      }
      const arrow = chooseTrapArrow(games, msg.moves)
      if (arrow === null) {
        return noCmd(withSession(model, { trap: null }))
      }
      // The arrow belongs to the Centurion's half-turn that just
      // resolved (turn - 1), so it decays in step with the player's
      // arrows: full pull on the player's reply, halved each round.
      const arrows = addBoardArrow(
        match.arrows,
        arrow,
        SOLO_OPPONENT,
        match.turn - 1,
      )
      return noCmd(
        playing({ ...session, trap: null, match: { ...match, arrows } }),
      )
    }

    case 'worst-moves-failed': {
      if (model.tag !== 'playing' || model.session.trap === null) {
        return noCmd(model)
      }
      return noCmd(
        withSession(model, {
          trap: null,
          notice: `Engine error: ${msg.message} Computer skipped its trap arrow.`,
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
