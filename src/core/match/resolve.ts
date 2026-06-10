import type { Chess } from 'chessops/chess'
import type { NormalMove } from 'chessops/types'
import { squareRank } from 'chessops/util'
import { pickIndex } from '../rng'
import { chooseEngineMove } from './engine'
import {
  type Arrow,
  type GameStatus,
  type MatchGame,
  type MatchPhase,
  type MatchState,
  type PlacedArrow,
  type PlayerId,
  activePlacer,
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

/**
 * The core turn of Centurion Chess: append the placed arrow, then advance
 * every active game by one ply. Arrows are processed newest-first and each
 * arrow instance moves at most one randomly chosen matching game; every
 * remaining game falls back to an engine move.
 *
 * Deterministic given the match's rng state, so two peers replaying the
 * same arrows reach identical states.
 */
export function placeArrowAndResolve(
  match: MatchState,
  arrow: Arrow,
): MatchState {
  if (match.phase.tag === 'finished') {
    return match
  }

  const placed: PlacedArrow = {
    arrow,
    placedBy: activePlacer(match),
    turn: match.turn,
  }
  const arrows = [...match.arrows, placed]

  const games = [...match.games]
  const advanced = new Set<number>()
  let rng = match.rng
  let arrowMoves = 0
  let engineMoves = 0

  for (let index = arrows.length - 1; index >= 0; index--) {
    const entry = arrows[index]
    if (entry === undefined) {
      continue
    }
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
      const move = arrowMoveForGame(game, entry.arrow)
      if (move !== null) {
        candidates.push({ gameIndex, move })
      }
    }
    if (candidates.length === 0) {
      continue
    }
    const [pick, nextRng] = pickIndex(rng, candidates.length)
    rng = nextRng
    const chosen = candidates[pick]
    if (chosen === undefined) {
      continue
    }
    const game = games[chosen.gameIndex]
    if (game === undefined) {
      continue
    }
    games[chosen.gameIndex] = applyMoveToGame(game, chosen.move)
    advanced.add(chosen.gameIndex)
    arrowMoves += 1
  }

  for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
    const game = games[gameIndex]
    if (
      game === undefined ||
      game.status.tag !== 'active' ||
      advanced.has(gameIndex)
    ) {
      continue
    }
    const [move, nextRng] = chooseEngineMove(game, rng)
    rng = nextRng
    games[gameIndex] = applyMoveToGame(game, move)
    engineMoves += 1
  }

  let p1Wins = 0
  let p2Wins = 0
  let draws = 0
  for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
    const before = match.games[gameIndex]
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
    p1: match.scores.p1 + p1Wins,
    p2: match.scores.p2 + p2Wins,
  }

  return {
    ...match,
    games,
    arrows,
    turn: match.turn + 1,
    scores,
    rng,
    phase: matchPhaseFor(games, scores),
    lastResolution: {
      turn: match.turn,
      arrowMoves,
      engineMoves,
      p1Wins,
      p2Wins,
      draws,
    },
  }
}
