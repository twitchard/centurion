import type { Chess } from 'chessops/chess'
import { makeFen } from 'chessops/fen'
import { type NormalMove, isNormal } from 'chessops/types'
import { parseUci, squareRank } from 'chessops/util'
import { type RngState, pickIndex } from '../rng'
import {
  type Arrow,
  type BoardArrow,
  type GameStatus,
  type MatchGame,
  type MatchPhase,
  type MatchState,
  type PlayerId,
  activePlacer,
  addBoardArrow,
  arrowPullWeight,
  canPlaceArrows,
  otherPlayer,
  positionKey,
} from './model'

export function flipSquare(square: number): number {
  return square ^ 56
}

/**
 * Translate an arrow from the canonical (player 1) frame into an actual
 * move for one game. Games where player 1 plays black are displayed
 * rank-flipped, so the arrow is rank-flipped back into board coordinates:
 * the same visual arrow means e2->e4 in your white games and e7->e5 in
 * your black games.
 */
export function arrowMoveForGame(
  game: MatchGame,
  arrow: Arrow,
): NormalMove | null {
  const from = game.whiteOwner === 1 ? arrow.from : flipSquare(arrow.from)
  const to = game.whiteOwner === 1 ? arrow.to : flipSquare(arrow.to)

  const position = game.position
  const piece = position.board.get(from)
  if (piece === undefined || piece.color !== position.turn) {
    return null
  }

  const toRank = squareRank(to)
  const move: NormalMove =
    piece.role === 'pawn' && (toRank === 0 || toRank === 7)
      ? { from, to, promotion: 'queen' }
      : { from, to }

  return position.isLegal(move) ? move : null
}

function statusAfterMove(
  game: MatchGame,
  position: Chess,
  repetitionCount: number,
): GameStatus {
  const outcome = position.outcome()
  if (outcome !== undefined) {
    if (outcome.winner !== undefined) {
      const winner: PlayerId =
        outcome.winner === 'white'
          ? game.whiteOwner
          : otherPlayer(game.whiteOwner)
      return { tag: 'won', by: winner }
    }
    return {
      tag: 'drawn',
      reason: position.isStalemate() ? 'stalemate' : 'insufficient-material',
    }
  }
  if (position.halfmoves >= 100) {
    return { tag: 'drawn', reason: 'fifty-move-rule' }
  }
  if (repetitionCount >= 3) {
    return { tag: 'drawn', reason: 'threefold-repetition' }
  }
  return { tag: 'active' }
}

function applyMoveToGame(game: MatchGame, move: NormalMove): MatchGame {
  const position = game.position.clone()
  position.play(move)
  const key = positionKey(position)
  const repetition = new Map(game.repetition)
  const count = (repetition.get(key) ?? 0) + 1
  repetition.set(key, count)
  return {
    ...game,
    position,
    repetition,
    status: statusAfterMove(game, position, count),
  }
}

function matchPhaseFor(
  games: readonly MatchGame[],
  scores: { readonly p1: number; readonly p2: number },
): MatchPhase {
  const active = games.filter((game) => game.status.tag === 'active').length
  if (active === 0) {
    if (scores.p1 === scores.p2) {
      return { tag: 'finished', winner: 'draw' }
    }
    return { tag: 'finished', winner: scores.p1 > scores.p2 ? 1 : 2 }
  }
  if (Math.abs(scores.p1 - scores.p2) > active) {
    return { tag: 'finished', winner: scores.p1 > scores.p2 ? 1 : 2 }
  }
  return { tag: 'active' }
}

/** Search depth for the Stockfish fallback, per the game spec. */
export const ENGINE_DEPTH = 5

export interface PendingEngineGame {
  readonly gameId: number
  readonly fen: string
}

/**
 * The state of a turn between the (synchronous, deterministic) arrow
 * phase and the (asynchronous) engine phase. `base` is the match as it
 * was before the arrow was placed, so a failed engine run can be
 * abandoned without committing anything.
 */
export interface PendingResolution {
  readonly base: MatchState
  readonly arrows: readonly BoardArrow[]
  readonly games: readonly MatchGame[]
  readonly rng: RngState
  readonly arrowMoves: number
  readonly pending: readonly PendingEngineGame[]
}

/**
 * Phase one of a turn: append the placed arrow, then process all arrows
 * newest-first. Each instance pulls up to its decay weight in randomly
 * chosen games for which it is a legal move (interpreted through the
 * vertical flip).
 * Games left over are listed in `pending` and must advance by a Stockfish
 * move supplied to `completeResolution`.
 *
 * This phase is deterministic given the match rng state, so two peers
 * replay it identically; the engine moves themselves travel over the
 * wire, computed once by the player who placed the arrow.
 */
export function beginResolution(
  match: MatchState,
  arrow: Arrow,
): PendingResolution | null {
  if (!canPlaceArrows(match)) {
    return null
  }
  const arrows = addBoardArrow(
    match.arrows,
    arrow,
    activePlacer(match),
    match.turn,
  )
  return beginResolutionPhase(match, arrows)
}

/**
 * Advance one ply without placing a new arrow: the existing arrow pool
 * still applies, everything else falls to the engine. Used by solo mode,
 * where the "opponent" half-turn plays out arrow-free.
 */
export function beginAutoResolution(
  match: MatchState,
): PendingResolution | null {
  if (match.phase.tag === 'finished') {
    return null
  }
  return beginResolutionPhase(match, [...match.arrows])
}

function beginResolutionPhase(
  match: MatchState,
  arrows: readonly BoardArrow[],
): PendingResolution {
  const games = [...match.games]
  const advanced = new Set<number>()
  let rng = match.rng
  let arrowMoves = 0

  for (let index = arrows.length - 1; index >= 0; index--) {
    const entry = arrows[index]
    if (entry === undefined) {
      continue
    }
    const weight = arrowPullWeight(
      entry.cardinality,
      entry.placedTurn,
      match.turn,
    )
    if (weight === 0) {
      continue
    }
    for (let pull = 0; pull < weight; pull++) {
      const candidates: {
        readonly gameIndex: number
        readonly move: NormalMove
      }[] = []
      for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
        const game = games[gameIndex]
        if (
          game === undefined ||
          game.status.tag !== 'active' ||
          advanced.has(gameIndex)
        ) {
          continue
        }
        const move = arrowMoveForGame(game, {
          from: entry.from,
          to: entry.to,
        })
        if (move !== null) {
          candidates.push({ gameIndex, move })
        }
      }
      if (candidates.length === 0) {
        break
      }
      const [pick, nextRng] = pickIndex(rng, candidates.length)
      rng = nextRng
      const chosen = candidates[pick]
      if (chosen === undefined) {
        break
      }
      const game = games[chosen.gameIndex]
      if (game === undefined) {
        break
      }
      games[chosen.gameIndex] = applyMoveToGame(game, chosen.move)
      advanced.add(chosen.gameIndex)
      arrowMoves += 1
    }
  }

  const pending: PendingEngineGame[] = []
  for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
    const game = games[gameIndex]
    if (
      game === undefined ||
      game.status.tag !== 'active' ||
      advanced.has(gameIndex)
    ) {
      continue
    }
    pending.push({
      gameId: game.id,
      fen: makeFen(game.position.toSetup()),
    })
  }

  return { base: match, arrows, games, rng, arrowMoves, pending }
}

/**
 * Phase two of a turn: apply one engine move (UCI, aligned with
 * `resolution.pending`) to each game the arrows did not reach, then score
 * newly decided games and check the match end conditions.
 *
 * Returns null if the supplied moves do not fit (wrong count or an
 * illegal move) — the caller treats that as an engine failure or an
 * out-of-sync peer and keeps the pre-arrow state.
 */
export function completeResolution(
  resolution: PendingResolution,
  engineMoves: readonly string[],
): MatchState | null {
  if (engineMoves.length !== resolution.pending.length) {
    return null
  }

  const games = [...resolution.games]
  for (let index = 0; index < resolution.pending.length; index++) {
    const entry = resolution.pending[index]
    const uci = engineMoves[index]
    if (entry === undefined || uci === undefined) {
      return null
    }
    const gameIndex = games.findIndex((game) => game.id === entry.gameId)
    const game = games[gameIndex]
    if (game === undefined) {
      return null
    }
    const move = parseUci(uci)
    if (move === undefined || !isNormal(move) || !game.position.isLegal(move)) {
      return null
    }
    games[gameIndex] = applyMoveToGame(game, move)
  }

  const base = resolution.base
  let p1Wins = 0
  let p2Wins = 0
  let draws = 0
  for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
    const before = base.games[gameIndex]
    const after = games[gameIndex]
    if (
      before === undefined ||
      after === undefined ||
      before.status.tag !== 'active' ||
      after.status.tag === 'active'
    ) {
      continue
    }
    if (after.status.tag === 'won') {
      if (after.status.by === 1) {
        p1Wins += 1
      } else {
        p2Wins += 1
      }
    } else {
      draws += 1
    }
  }

  const scores = {
    p1: base.scores.p1 + p1Wins,
    p2: base.scores.p2 + p2Wins,
  }

  const nextTurn = base.turn + 1
  const activeArrows = resolution.arrows.filter(
    (entry) =>
      arrowPullWeight(entry.cardinality, entry.placedTurn, nextTurn) > 0,
  )

  return {
    ...base,
    games,
    arrows: activeArrows,
    turn: nextTurn,
    scores,
    rng: resolution.rng,
    phase: matchPhaseFor(games, scores),
    lastResolution: {
      turn: base.turn,
      arrowMoves: resolution.arrowMoves,
      engineMoves: resolution.pending.length,
      p1Wins,
      p2Wins,
      draws,
    },
  }
}
