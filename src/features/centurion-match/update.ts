import {
  decodeMatchWireMessage,
  encodeMatchWireMessage,
} from '../../core/match/codec'
import {
  ARROW_PLACEMENT_LAST_TURN,
  type Arrow,
  type BoardSquare,
  type MatchState,
  activePlacer,
  canPlaceArrows,
  initMatch,
  otherPlayer,
} from '../../core/match/model'
import { defaultReplayGameId } from '../../core/match/pgn'
import { toCanonicalSquare } from '../../core/match/render'
import {
  type PendingResolution,
  beginAutoResolution,
  beginResolution,
  completeResolution,
} from '../../core/match/resolve'
import {
  decodeMatchSnapshot,
  encodeMatchState,
} from '../../core/match/snapshot'
import { parseArrowList } from '../../core/superposition/parse-arrow-list'
import { type UpdateResult, assertNever, noCmd } from '../../core/update'
import type { TransportStatus } from '../../ports/transport'
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
  | { readonly tag: 'new-match-requested' }
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
  | { readonly tag: 'leave-session-requested' }
  | {
      readonly tag: 'transport-status-changed'
      readonly status: TransportStatus
      readonly code: string
      readonly isHost: boolean
      readonly pendingSeed?: number
    }
  | { readonly tag: 'transport-peer-joined' }
  | {
      readonly tag: 'restore-session-requested'
      readonly persisted: PersistedCenturion
    }
  | { readonly tag: 'transport-peer-left' }
  | { readonly tag: 'transport-message-received'; readonly payload: unknown }
  | { readonly tag: 'game-replay-game-selected'; readonly gameId: number }
  | {
      readonly tag: 'game-replay-step'
      readonly step: 'start' | 'prev' | 'next' | 'end'
    }

export type CenturionCmd =
  | { readonly tag: 'transport-create-room' }
  | { readonly tag: 'transport-host-room'; readonly code: string }
  | { readonly tag: 'transport-join-room'; readonly code: string }
  | { readonly tag: 'transport-disconnect' }
  | { readonly tag: 'transport-send'; readonly payload: unknown }
  | {
      readonly tag: 'compute-engine-moves'
      readonly fens: readonly string[]
    }
  | { readonly tag: 'share-invite'; readonly code: string }
  | { readonly tag: 'copy-invite'; readonly code: string }

export const LOBBY_COPY =
  'Play both seats at one device, or start a multiplayer match and share the code.'
const INVALID_JOIN_CODE_COPY = 'Enter a valid 6-digit match code.'
const TRANSPORT_ERROR_COPY =
  'Unable to connect to a match. Both players need the same code, the host must still be waiting, and your networks must allow WebRTC (try Wi‑Fi, disable VPN, or use the connection log below).'
const NOT_YOUR_TURN_COPY = 'Waiting for your opponent to place an arrow.'
const ARROWLESS_PHASE_COPY =
  'Turn 100 has passed; Stockfish is playing out the remaining games.'
const OUT_OF_SYNC_COPY =
  'Received an out-of-sync message from the opponent; the match may have diverged.'
const RESOLVING_COPY = 'Stockfish is resolving the turn...'

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

function transportRejoinCommands(
  model: CenturionModel,
): readonly CenturionCmd[] {
  switch (model.tag) {
    case 'waiting':
      return [{ tag: 'transport-host-room', code: model.code }]
    case 'syncing':
      return [{ tag: 'transport-join-room', code: model.code }]
    case 'playing': {
      const mode = model.session.mode
      if (mode.tag !== 'remote') {
        return []
      }
      if (mode.you === 1) {
        return [{ tag: 'transport-host-room', code: mode.code }]
      }
      return [{ tag: 'transport-join-room', code: mode.code }]
    }
    default:
      return []
  }
}

function isArrowlessPhase(match: MatchState): boolean {
  return match.turn > ARROW_PLACEMENT_LAST_TURN
}

function arrowSendCommands(
  session: MatchSession,
  resolution: PendingResolution,
  moves: readonly string[],
): readonly CenturionCmd[] {
  if (session.mode.tag !== 'remote') {
    return []
  }
  const placed = resolution.arrows[resolution.arrows.length - 1]
  if (placed === undefined) {
    return []
  }
  return [
    {
      tag: 'transport-send',
      payload: encodeMatchWireMessage({
        type: 'centurion:arrow',
        from: placed.from,
        to: placed.to,
        turn: placed.placedTurn,
        moves,
      }),
    },
  ]
}

function autoSendCommands(
  session: MatchSession,
  resolution: PendingResolution,
  moves: readonly string[],
): readonly CenturionCmd[] {
  if (session.mode.tag !== 'remote') {
    return []
  }
  return [
    {
      tag: 'transport-send',
      payload: encodeMatchWireMessage({
        type: 'centurion:auto',
        turn: resolution.base.turn,
        moves,
      }),
    },
  ]
}

function resolutionSendCommands(
  session: MatchSession,
  resolution: PendingResolution,
  moves: readonly string[],
): readonly CenturionCmd[] {
  if (isArrowlessPhase(resolution.base)) {
    return autoSendCommands(session, resolution, moves)
  }
  return arrowSendCommands(session, resolution, moves)
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
 * Solo mode: after the player's arrow resolves the white half-turn, the
 * black half-turn plays out immediately with no new arrow. After turn
 * 100, every ply auto-plays with no new arrows. Returns the settled
 * session, or a new resolving state plus the engine command for the
 * next automatic ply.
 */
function continueAfterResolution(
  session: MatchSession,
  match: MatchState,
): UpdateResult<CenturionModel, CenturionCmd> {
  const settled = withFinishedReplay(session, match)
  if (!shouldChainAutoResolution(session, match)) {
    return noCmd(playing(settled))
  }
  if (
    isArrowlessPhase(match) &&
    session.mode.tag === 'remote' &&
    !placerIsYou(settled)
  ) {
    return noCmd(playing(settled))
  }
  return driveAutoResolution(settled)
}

function submitArrow(
  session: MatchSession,
  visualFrom: BoardSquare,
  visualTo: BoardSquare,
): UpdateResult<CenturionModel, CenturionCmd> {
  if (session.match.phase.tag === 'finished' || session.resolving !== null) {
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
    const [model, commands] = continueAfterResolution(cleared, match)
    return [
      model,
      [...resolutionSendCommands(session, resolution, []), ...commands],
    ]
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
      return [
        { tag: 'connecting', role: 'host', code: '' },
        [{ tag: 'transport-create-room' }],
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
        { tag: 'connecting', role: 'guest', code },
        [{ tag: 'transport-join-room', code }],
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
      // You are always player 1 (gold); every arrow is yours.
      const match = initMatch(msg.seed, { firstPlacer: 1 })
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
      if (session.resolving !== null) {
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
      const [nextModel, commands] = continueAfterResolution(session, match)
      return [
        nextModel,
        [
          ...resolutionSendCommands(session, resolution, msg.moves),
          ...commands,
        ],
      ]
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

    case 'leave-session-requested': {
      const needsDisconnect =
        model.tag === 'connecting' ||
        model.tag === 'waiting' ||
        model.tag === 'syncing' ||
        (model.tag === 'playing' && model.session.mode.tag === 'remote')
      return [
        initCenturionModel(),
        needsDisconnect ? [{ tag: 'transport-disconnect' }] : [],
      ]
    }

    case 'transport-status-changed': {
      switch (msg.status) {
        case 'waiting': {
          if (model.tag === 'connecting' && model.role === 'host') {
            if (msg.pendingSeed === undefined) {
              return noCmd(model)
            }
            return noCmd({
              tag: 'waiting',
              code: msg.code,
              pendingSeed: msg.pendingSeed >>> 0,
              notice: null,
            })
          }
          if (model.tag === 'playing' && model.session.mode.tag === 'remote') {
            return noCmd(
              withSession(model, {
                notice: 'Opponent disconnected.',
              }),
            )
          }
          return noCmd(model)
        }
        case 'connected': {
          if (model.tag === 'connecting' && model.role === 'guest') {
            return noCmd({ tag: 'syncing', code: msg.code })
          }
          return noCmd(model)
        }
        case 'disconnected':
        case 'error': {
          if (
            model.tag === 'connecting' ||
            model.tag === 'waiting' ||
            model.tag === 'syncing'
          ) {
            return noCmd({
              tag: 'lobby',
              joinCodeInput: '',
              notice: msg.status === 'error' ? TRANSPORT_ERROR_COPY : null,
            })
          }
          if (model.tag === 'playing' && model.session.mode.tag === 'remote') {
            return noCmd(
              withSession(model, {
                mode: { ...model.session.mode, peerConnected: false },
                notice: 'Connection lost.',
              }),
            )
          }
          return noCmd(model)
        }
        case 'connecting':
          return noCmd(model)
        default:
          return assertNever(msg.status)
      }
    }

    case 'transport-peer-joined': {
      if (model.tag === 'waiting') {
        const match = initMatch(model.pendingSeed)
        const session = startSession(match, {
          tag: 'remote',
          you: 1,
          code: model.code,
          peerConnected: true,
        })
        return [
          playing(session),
          [
            {
              tag: 'transport-send',
              payload: encodeMatchWireMessage({
                type: 'centurion:start',
                seed: model.pendingSeed,
                gameCount: match.gameCount,
              }),
            },
          ],
        ]
      }
      if (model.tag === 'playing' && model.session.mode.tag === 'remote') {
        const mode = model.session.mode
        const nextSession = {
          ...model.session,
          mode: { ...mode, peerConnected: true },
          notice: 'Opponent reconnected.',
        }
        if (mode.you === 1) {
          return [
            playing(nextSession),
            [
              {
                tag: 'transport-send',
                payload: encodeMatchWireMessage({
                  type: 'centurion:sync',
                  snapshot: encodeMatchState(model.session.match),
                }),
              },
            ],
          ]
        }
        return noCmd(playing(nextSession))
      }
      return noCmd(model)
    }

    case 'transport-peer-left': {
      if (model.tag === 'playing' && model.session.mode.tag === 'remote') {
        return noCmd(
          withSession(model, {
            mode: { ...model.session.mode, peerConnected: false },
            notice: 'Opponent disconnected.',
          }),
        )
      }
      if (model.tag === 'syncing') {
        return noCmd({
          tag: 'lobby',
          joinCodeInput: '',
          notice: 'The host left before the match started.',
        })
      }
      return noCmd(model)
    }

    case 'transport-message-received': {
      const wire = decodeMatchWireMessage(msg.payload)
      if (wire === null) {
        return noCmd(model)
      }
      if (wire.type === 'centurion:start') {
        if (model.tag !== 'syncing') {
          return noCmd(model)
        }
        const match = initMatch(wire.seed, { gameCount: wire.gameCount })
        return noCmd(
          playing(
            startSession(match, {
              tag: 'remote',
              you: 2,
              code: model.code,
              peerConnected: true,
            }),
          ),
        )
      }
      if (wire.type === 'centurion:sync') {
        const match = decodeMatchSnapshot(wire.snapshot)
        if (match === null) {
          return noCmd(model)
        }
        if (model.tag === 'syncing') {
          return noCmd(
            playing(
              startSession(match, {
                tag: 'remote',
                you: 2,
                code: model.code,
                peerConnected: true,
              }),
            ),
          )
        }
        if (model.tag !== 'playing') {
          return noCmd(model)
        }
        const session = model.session
        if (session.mode.tag !== 'remote' || session.mode.you !== 2) {
          return noCmd(model)
        }
        return noCmd(
          playing(
            withFinishedReplay(
              {
                ...session,
                selectedSquare: null,
                inputError: null,
                notice: 'Synced with host.',
              },
              match,
            ),
          ),
        )
      }
      if (model.tag !== 'playing') {
        return noCmd(model)
      }
      const session = model.session
      const mode = session.mode
      if (mode.tag !== 'remote') {
        return noCmd(model)
      }
      const opponent = otherPlayer(mode.you)
      if (
        wire.turn !== session.match.turn ||
        activePlacer(session.match) !== opponent ||
        session.match.phase.tag === 'finished'
      ) {
        return noCmd(withSession(model, { notice: OUT_OF_SYNC_COPY }))
      }
      if (wire.type === 'centurion:auto') {
        if (!isArrowlessPhase(session.match)) {
          return noCmd(withSession(model, { notice: OUT_OF_SYNC_COPY }))
        }
        const resolution = beginAutoResolution(session.match)
        const match =
          resolution === null
            ? null
            : completeResolution(resolution, wire.moves)
        if (match === null) {
          return noCmd(withSession(model, { notice: OUT_OF_SYNC_COPY }))
        }
        return noCmd(
          playing(
            withFinishedReplay(
              { ...session, selectedSquare: null, inputError: null },
              match,
            ),
          ),
        )
      }
      // The arrow phase replays deterministically from the shared rng;
      // the opponent's Stockfish moves are validated and applied verbatim.
      const resolution = beginResolution(session.match, {
        from: wire.from,
        to: wire.to,
      })
      const match =
        resolution === null ? null : completeResolution(resolution, wire.moves)
      if (match === null) {
        return noCmd(withSession(model, { notice: OUT_OF_SYNC_COPY }))
      }
      return noCmd(
        playing(
          withFinishedReplay(
            { ...session, selectedSquare: null, inputError: null },
            match,
          ),
        ),
      )
    }

    case 'restore-session-requested': {
      const restored = centurionModelFromPersistence(msg.persisted)
      if (restored === null) {
        return noCmd(model)
      }
      return [restored, transportRejoinCommands(restored)]
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
