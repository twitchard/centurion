import {
  type BoardPoint,
  INK_BUDGET,
  type InkMark,
  classifyStroke,
  inkUsed,
  integrateMark,
} from '../../core/ink/gesture'
import {
  INK_GAME_COUNT,
  type InkDifficulty,
  type InkMatch,
  applyInkPly,
  initInkMatch,
  inkMover,
  inkSearchTargets,
} from '../../core/ink/match'
import { previewInk } from '../../core/ink/preview'
import type { RankedMove } from '../../core/match/resolve'
import type { UpdateResult } from '../../core/update'

export interface InkSession {
  readonly match: InkMatch
  readonly marks: readonly InkMark[]
  /** Previous mark lists, newest last, so undo can restore a merged cross. */
  readonly markPast: readonly (readonly InkMark[])[]
  readonly ranks: readonly (readonly RankedMove[])[] | null
  readonly searchId: number | null
  readonly searchSide: 'player' | 'computer' | null
  readonly requestSeq: number
  readonly notice: string | null
}

export type InkModel = { readonly tag: 'playing'; readonly session: InkSession }

export type InkMsg =
  | {
      readonly tag: 'restart'
      readonly seed: number
      readonly difficulty: InkDifficulty
      readonly gameCount?: number
    }
  | { readonly tag: 'stroke'; readonly points: readonly BoardPoint[] }
  | { readonly tag: 'undo' }
  | { readonly tag: 'clear' }
  | { readonly tag: 'commit' }
  | { readonly tag: 'pass' }
  | {
      readonly tag: 'ranks'
      readonly requestId: number
      readonly ranked: readonly (readonly RankedMove[])[]
    }
  | {
      readonly tag: 'ranks-failed'
      readonly requestId: number
      readonly message: string
    }

export type InkCmd = {
  readonly tag: 'search'
  readonly requestId: number
  readonly fens: readonly string[]
}

export function bootInkSession(
  seed: number,
  difficulty: InkDifficulty = 'fair',
  gameCount: number = INK_GAME_COUNT,
  requestSeq = 0,
): UpdateResult<InkModel, InkCmd> {
  const match = initInkMatch(seed, { difficulty, gameCount })
  return withSearch(
    {
      tag: 'playing',
      session: {
        match,
        marks: [],
        markPast: [],
        ranks: null,
        searchId: null,
        searchSide: null,
        requestSeq,
        notice: null,
      },
    },
    'player',
  )
}

export function updateInk(
  model: InkModel,
  msg: InkMsg,
): UpdateResult<InkModel, InkCmd> {
  switch (msg.tag) {
    case 'restart':
      return bootInkSession(
        msg.seed,
        msg.difficulty,
        msg.gameCount,
        model.session.requestSeq,
      )
    case 'stroke':
      return [withStroke(model, msg.points), []]
    case 'undo':
      return [undoMarks(model), []]
    case 'clear':
      return [clearMarks(model), []]
    case 'commit':
      return commit(model, model.session.marks)
    case 'pass':
      return commit(model, [])
    case 'ranks':
      return onRanks(model, msg.requestId, msg.ranked)
    case 'ranks-failed':
      return onRanksFailed(model, msg.requestId, msg.message)
  }
}

function withStroke(model: InkModel, points: readonly BoardPoint[]): InkModel {
  if (!canDraw(model)) {
    return model
  }
  const remaining = INK_BUDGET - inkUsed(model.session.marks)
  const result = classifyStroke(points, remaining)
  if (result.tag === 'reject') {
    return setNotice(model, result.reason)
  }
  const marks = integrateMark(model.session.marks, result.mark)
  return {
    tag: 'playing',
    session: {
      ...model.session,
      markPast: [...model.session.markPast, model.session.marks].slice(-20),
      marks,
      notice: null,
    },
  }
}

function undoMarks(model: InkModel): InkModel {
  const past = model.session.markPast
  if (!canDraw(model) || past.length === 0) {
    return model
  }
  const marks = past[past.length - 1] ?? []
  return {
    tag: 'playing',
    session: {
      ...model.session,
      marks,
      markPast: past.slice(0, -1),
      notice: null,
    },
  }
}

function clearMarks(model: InkModel): InkModel {
  if (!canDraw(model) || model.session.marks.length === 0) {
    return model
  }
  return {
    tag: 'playing',
    session: {
      ...model.session,
      markPast: [...model.session.markPast, model.session.marks].slice(-20),
      marks: [],
      notice: null,
    },
  }
}

function commit(
  model: InkModel,
  marks: readonly InkMark[],
): UpdateResult<InkModel, InkCmd> {
  const session = model.session
  if (
    session.ranks === null ||
    session.searchId !== null ||
    session.match.phase.tag === 'finished' ||
    inkMover(session.match) !== 'player'
  ) {
    return [model, []]
  }
  const targets = inkSearchTargets(session.match)
  const next = applyInkPly(session.match, targets.gameIds, session.ranks, marks)
  if (next === null) {
    return [setNotice(model, 'The soldiers could not move.'), []]
  }
  const played = setSession(model, {
    match: next,
    marks: [],
    markPast: [],
    ranks: null,
    notice: null,
  })
  if (next.phase.tag === 'finished' || inkMover(next) === null) {
    return [played, []]
  }
  return withSearch(played, 'computer')
}

function onRanks(
  model: InkModel,
  requestId: number,
  ranked: readonly (readonly RankedMove[])[],
): UpdateResult<InkModel, InkCmd> {
  const session = model.session
  if (session.searchId !== requestId) {
    return [model, []]
  }
  if (session.searchSide === 'computer') {
    const targets = inkSearchTargets(session.match)
    const next = applyInkPly(session.match, targets.gameIds, ranked, [])
    if (next === null) {
      return [setNotice(model, 'The computer could not move.'), []]
    }
    const played = setSession(model, {
      match: next,
      ranks: null,
      searchId: null,
      searchSide: null,
      notice: null,
    })
    if (next.phase.tag === 'finished' || inkMover(next) !== 'player') {
      return [played, []]
    }
    return withSearch(played, 'player')
  }
  return [
    setSession(model, {
      ranks: ranked,
      searchId: null,
      searchSide: null,
      notice: null,
    }),
    [],
  ]
}

function onRanksFailed(
  model: InkModel,
  requestId: number,
  message: string,
): UpdateResult<InkModel, InkCmd> {
  if (model.session.searchId !== requestId) {
    return [model, []]
  }
  return [setNotice(model, message), []]
}

function withSearch(
  model: InkModel,
  side: 'player' | 'computer',
): UpdateResult<InkModel, InkCmd> {
  const targets = inkSearchTargets(model.session.match)
  if (targets.fens.length === 0) {
    return [model, []]
  }
  const requestId = model.session.requestSeq + 1
  return [
    setSession(model, {
      requestSeq: requestId,
      searchId: requestId,
      searchSide: side,
      ranks: null,
    }),
    [{ tag: 'search', requestId, fens: targets.fens }],
  ]
}

export function canDraw(model: InkModel): boolean {
  const session = model.session
  return (
    session.match.phase.tag === 'active' &&
    inkMover(session.match) === 'player' &&
    session.searchSide !== 'computer'
  )
}

export function sessionPreview(model: InkModel) {
  const session = model.session
  if (session.ranks === null || inkMover(session.match) !== 'player') {
    return null
  }
  return previewInk(session.match, session.ranks, session.marks)
}

function setNotice(model: InkModel, notice: string): InkModel {
  return setSession(model, { notice })
}

function setSession(model: InkModel, patch: Partial<InkSession>): InkModel {
  return { tag: 'playing', session: { ...model.session, ...patch } }
}
