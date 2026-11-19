import {
  type BoardPoint,
  type InkMark,
  interpretDrawing,
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
  readonly strokes: readonly (readonly BoardPoint[])[]
  readonly marks: readonly InkMark[]
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
  | { readonly tag: 'recognize' }
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
        strokes: [],
        marks: [],
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
    case 'recognize':
      return [recognizeStrokes(model), []]
    case 'commit': {
      const marks =
        model.session.marks.length > 0
          ? model.session.marks
          : interpretDrawing(model.session.strokes)
      return commit(model, marks)
    }
    case 'pass':
      return commit(model, [])
    case 'ranks':
      return onRanks(model, msg.requestId, msg.ranked)
    case 'ranks-failed':
      return onRanksFailed(model, msg.requestId, msg.message)
  }
}

function withStroke(model: InkModel, points: readonly BoardPoint[]): InkModel {
  if (!canDraw(model) || points.length < 2) {
    return model
  }
  return withStrokes(model, [...model.session.strokes, points])
}

function undoMarks(model: InkModel): InkModel {
  if (!canDraw(model) || model.session.strokes.length === 0) {
    return model
  }
  return withStrokes(model, model.session.strokes.slice(0, -1))
}

function clearMarks(model: InkModel): InkModel {
  if (!canDraw(model) || model.session.strokes.length === 0) {
    return model
  }
  return withStrokes(model, [])
}

function withStrokes(
  model: InkModel,
  strokes: readonly (readonly BoardPoint[])[],
): InkModel {
  return setSession(model, {
    strokes,
    marks: [],
    notice: null,
  })
}

function recognizeStrokes(model: InkModel): InkModel {
  if (!canDraw(model) || model.session.strokes.length === 0) {
    return model
  }
  return setSession(model, {
    marks: interpretDrawing(model.session.strokes),
  })
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
    strokes: [],
    marks: [],
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
