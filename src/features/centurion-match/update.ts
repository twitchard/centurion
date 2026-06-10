import {
  decodeMatchWireMessage,
  encodeMatchWireMessage,
} from '../../core/match/codec'
import {
  type Arrow,
  type BoardSquare,
  type MatchState,
  activePlacer,
  initMatch,
  otherPlayer,
} from '../../core/match/model'
import { toCanonicalSquare } from '../../core/match/render'
import { placeArrowAndResolve } from '../../core/match/resolve'
import { parseArrowList } from '../../core/superposition/parse-arrow-list'
import { type UpdateResult, assertNever, noCmd } from '../../core/update'
import type { TransportStatus } from '../../ports/transport'
import {
  type CenturionModel,
  type MatchSession,
  initCenturionModel,
  sessionViewer,
} from './model'

export type CenturionMsg =
  | { readonly tag: 'join-code-updated'; readonly value: string }
  | { readonly tag: 'new-match-requested' }
  | { readonly tag: 'join-match-requested' }
  | { readonly tag: 'pass-and-play-requested'; readonly seed: number }
  | { readonly tag: 'board-square-clicked'; readonly square: BoardSquare }
  | { readonly tag: 'arrow-input-updated'; readonly value: string }
  | { readonly tag: 'arrow-submit-requested' }
  | { readonly tag: 'leave-session-requested' }
  | {
      readonly tag: 'transport-status-changed'
      readonly status: TransportStatus
      readonly code: string
      readonly isHost: boolean
    }
  | { readonly tag: 'transport-peer-joined'; readonly seed: number }
  | { readonly tag: 'transport-peer-left' }
  | { readonly tag: 'transport-message-received'; readonly payload: unknown }

export type CenturionCmd =
  | { readonly tag: 'transport-create-room' }
  | { readonly tag: 'transport-join-room'; readonly code: string }
  | { readonly tag: 'transport-disconnect' }
  | { readonly tag: 'transport-send'; readonly payload: unknown }

export const LOBBY_COPY =
  'Play both seats at one device, or start a multiplayer match and share the code.'
const INVALID_JOIN_CODE_COPY = 'Enter a valid 6-digit match code.'
const TRANSPORT_ERROR_COPY =
  'Unable to connect to a match. Check your connection and try again.'
const NOT_YOUR_TURN_COPY = 'Waiting for your opponent to place an arrow.'
const OUT_OF_SYNC_COPY =
  'Received an out-of-sync message from the opponent; the match may have diverged.'

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
    selectedSquare: null,
    arrowInput: '',
    inputError: null,
    notice: null,
  }
}

function placerIsYou(session: MatchSession): boolean {
  if (session.mode.tag === 'local') {
    return true
  }
  return activePlacer(session.match) === session.mode.you
}

function submitArrow(
  session: MatchSession,
  visualFrom: BoardSquare,
  visualTo: BoardSquare,
): UpdateResult<CenturionModel, CenturionCmd> {
  if (session.match.phase.tag === 'finished') {
    return noCmd(playing(session))
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
  const turnBefore = session.match.turn
  const match = placeArrowAndResolve(session.match, arrow)
  const nextSession: MatchSession = {
    ...session,
    match,
    selectedSquare: null,
    arrowInput: '',
    inputError: null,
  }

  if (session.mode.tag === 'remote') {
    return [
      playing(nextSession),
      [
        {
          tag: 'transport-send',
          payload: encodeMatchWireMessage({
            type: 'centurion:arrow',
            from: arrow.from,
            to: arrow.to,
            turn: turnBefore,
          }),
        },
      ],
    ]
  }
  return noCmd(playing(nextSession))
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

    case 'board-square-clicked': {
      if (model.tag !== 'playing') {
        return noCmd(model)
      }
      const session = model.session
      if (session.match.phase.tag === 'finished') {
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
            return noCmd({ tag: 'waiting', code: msg.code })
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
        const match = initMatch(msg.seed)
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
                seed: msg.seed,
                gameCount: match.gameCount,
              }),
            },
          ],
        ]
      }
      if (model.tag === 'playing' && model.session.mode.tag === 'remote') {
        return noCmd(
          withSession(model, {
            mode: { ...model.session.mode, peerConnected: true },
            notice: 'Opponent reconnected.',
          }),
        )
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
      const match = placeArrowAndResolve(session.match, {
        from: wire.from,
        to: wire.to,
      })
      return noCmd(
        withSession(model, { match, selectedSquare: null, inputError: null }),
      )
    }

    default:
      return assertNever(msg)
  }
}
