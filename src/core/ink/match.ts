import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import { isNormal } from 'chessops/types'
import { parseUci } from 'chessops/util'
import {
  type GameStatus,
  type MatchPhase,
  type PlayerId,
  type RecordedMove,
  STANDARD_WHITE_TO_MOVE_FEN,
  positionKey,
} from '../match/model'
import type { RankedMove } from '../match/resolve'
import { type RngState, seedRng } from '../rng'
import type { InkMark } from './gesture'
import { legalTopMoves, sampleIndex, soldierDraw } from './sample'
import { type TemperamentId, dealTemperaments, deckCounts } from './temperament'

export const INK_GAME_COUNT = 100

export type InkDifficulty = 'fair' | 'hard'
export type InkSide = 'player' | 'computer'

export interface InkGame {
  readonly id: number
  readonly position: Chess
  readonly repetition: ReadonlyMap<string, number>
  readonly status: GameStatus
  readonly moves: readonly RecordedMove[]
  readonly startingFen: string
  readonly evalCp: number
  readonly playerTemperament: TemperamentId
  readonly computerTemperament: TemperamentId
}

export interface InkPlySummary {
  readonly turn: number
  readonly side: InkSide
  readonly moved: number
  readonly shifted: number
  readonly playerWins: number
  readonly computerWins: number
  readonly draws: number
}

export interface InkMatch {
  readonly gameCount: number
  readonly games: readonly InkGame[]
  readonly turn: number
  readonly scores: { readonly p1: number; readonly p2: number }
  readonly rng: RngState
  readonly difficulty: InkDifficulty
  readonly phase: MatchPhase
  /**
   * Cumulative expected centipawns the player's ink has added versus
   * each soldier's unled draw, summed across games and the player's turns.
   */
  readonly inkValueCp: number
  readonly lastInkCp: number | null
  readonly lastPly: InkPlySummary | null
}

export interface InkMatchOptions {
  readonly gameCount?: number
  readonly difficulty?: InkDifficulty
  readonly playerTemperaments?: readonly TemperamentId[]
  readonly computerTemperaments?: readonly TemperamentId[]
  readonly fens?: readonly string[]
}

export function initInkMatch(
  seed: number,
  options?: InkMatchOptions,
): InkMatch {
  const fens = options?.fens
  const gameCount =
    fens !== undefined ? fens.length : (options?.gameCount ?? INK_GAME_COUNT)
  if (gameCount < 1) {
    throw new Error('A match needs at least one game')
  }
  const difficulty = options?.difficulty ?? 'fair'
  let rng = seedRng(seed)

  let playerTemperaments = options?.playerTemperaments
  if (playerTemperaments === undefined) {
    const [dealt, next] = dealTemperaments(deckCounts(gameCount, 'fair'), rng)
    rng = next
    playerTemperaments = dealt
  } else if (playerTemperaments.length !== gameCount) {
    throw new Error('playerTemperaments length must match game count')
  }

  let computerTemperaments = options?.computerTemperaments
  if (computerTemperaments === undefined) {
    const [dealt, next] = dealTemperaments(
      deckCounts(gameCount, difficulty),
      rng,
    )
    rng = next
    computerTemperaments = dealt
  } else if (computerTemperaments.length !== gameCount) {
    throw new Error('computerTemperaments length must match game count')
  }

  const games: InkGame[] = []
  for (let id = 0; id < gameCount; id++) {
    const fen = fens?.[id] ?? STANDARD_WHITE_TO_MOVE_FEN
    const position = positionFromFen(fen)
    const repetition = new Map<string, number>()
    repetition.set(positionKey(position), 1)
    const playerTemperament = playerTemperaments[id]
    const computerTemperament = computerTemperaments[id]
    if (playerTemperament === undefined || computerTemperament === undefined) {
      throw new Error(`missing temperament for game ${id}`)
    }
    games.push({
      id,
      position,
      repetition,
      status: { tag: 'active' },
      moves: [],
      startingFen: fen,
      evalCp: 0,
      playerTemperament,
      computerTemperament,
    })
  }

  return {
    gameCount,
    games,
    turn: 1,
    scores: { p1: 0, p2: 0 },
    rng,
    difficulty,
    phase: { tag: 'active' },
    inkValueCp: 0,
    lastInkCp: null,
    lastPly: null,
  }
}

export function inkMover(match: InkMatch): InkSide | null {
  for (const game of match.games) {
    if (game.status.tag !== 'active') {
      continue
    }
    return game.position.turn === 'white' ? 'player' : 'computer'
  }
  return null
}

export interface InkSearch {
  readonly gameIds: readonly number[]
  readonly fens: readonly string[]
}

export function inkSearchTargets(match: InkMatch): InkSearch {
  const gameIds: number[] = []
  const fens: string[] = []
  for (const game of match.games) {
    if (game.status.tag !== 'active') {
      continue
    }
    gameIds.push(game.id)
    fens.push(makeFen(game.position.toSetup()))
  }
  return { gameIds, fens }
}

/**
 * Play one ply in every active game. Marks bias the player only; the
 * computer draws its temperament with a blank board. A soldier who can
 * see mate plays it. Returns null when the engine output does not fit.
 */
export function applyInkPly(
  match: InkMatch,
  gameIds: readonly number[],
  ranked: readonly (readonly RankedMove[])[],
  marks: readonly InkMark[],
): InkMatch | null {
  if (match.phase.tag === 'finished') {
    return null
  }
  if (ranked.length !== gameIds.length) {
    return null
  }
  const side = inkMover(match)
  if (side === null) {
    return null
  }
  const ink = side === 'player' ? marks : []

  const games = [...match.games]
  let rng = match.rng
  let shifted = 0
  let moved = 0
  let inkCp = 0

  for (let index = 0; index < gameIds.length; index++) {
    const gameId = gameIds[index]
    const list = ranked[index]
    if (gameId === undefined || list === undefined) {
      return null
    }
    const gameIndex = games.findIndex((game) => game.id === gameId)
    const game = games[gameIndex]
    if (game === undefined || game.status.tag !== 'active') {
      return null
    }
    const candidates = legalTopMoves(game.position, list)
    if (candidates.length === 0) {
      return null
    }
    const temperament =
      side === 'player' ? game.playerTemperament : game.computerTemperament
    const draw = soldierDraw(temperament, candidates, ink)
    const [pick, nextRng] = sampleIndex(draw.biased, rng)
    rng = nextRng
    const chosen = candidates[pick]
    if (chosen === undefined) {
      return null
    }
    if (draw.favoriteBase !== draw.favoriteBiased) {
      shifted += 1
    }
    inkCp += draw.expectedCpDelta
    const boosted =
      ink.length > 0 && (draw.biased[pick] ?? 0) > (draw.base[pick] ?? 0) * 1.05
    const recorded: RecordedMove = boosted
      ? { uci: chosen.uci, source: 'command', commandOwner: 1 }
      : { uci: chosen.uci, source: 'free' }
    const moverIsWhite = game.position.turn === 'white'
    const evalCp = moverIsWhite ? chosen.cp : -chosen.cp
    games[gameIndex] = applyMove(game, recorded, evalCp)
    moved += 1
  }

  let playerWins = 0
  let computerWins = 0
  let draws = 0
  for (let index = 0; index < games.length; index++) {
    const before = match.games[index]
    const after = games[index]
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
        playerWins += 1
      } else {
        computerWins += 1
      }
    } else {
      draws += 1
    }
  }

  const scores = {
    p1: match.scores.p1 + playerWins,
    p2: match.scores.p2 + computerWins,
  }
  const playerInk = side === 'player'

  return {
    ...match,
    games,
    turn: match.turn + 1,
    scores,
    rng,
    phase: inkMatchPhase(games, scores),
    inkValueCp: match.inkValueCp + (playerInk ? inkCp : 0),
    lastInkCp: playerInk ? inkCp : match.lastInkCp,
    lastPly: {
      turn: match.turn,
      side,
      moved,
      shifted: playerInk ? shifted : 0,
      playerWins,
      computerWins,
      draws,
    },
  }
}

/** Same majority / unreachable-lead rule as the typed-order match. */
export function inkMatchPhase(
  games: readonly { readonly status: GameStatus }[],
  scores: { readonly p1: number; readonly p2: number },
): MatchPhase {
  const undecided = games.filter(
    (game) => game.status.tag === 'active' || game.status.tag === 'pending',
  ).length
  if (undecided === 0) {
    if (scores.p1 === scores.p2) {
      return { tag: 'finished', winner: 'draw' }
    }
    return { tag: 'finished', winner: scores.p1 > scores.p2 ? 1 : 2 }
  }
  if (Math.abs(scores.p1 - scores.p2) > undecided) {
    return { tag: 'finished', winner: scores.p1 > scores.p2 ? 1 : 2 }
  }
  return { tag: 'active' }
}

function applyMove(
  game: InkGame,
  recorded: RecordedMove,
  evalCp: number,
): InkGame {
  const move = parseUci(recorded.uci)
  if (move === undefined || !isNormal(move)) {
    throw new Error(`Unplayable move ${recorded.uci}`)
  }
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
    status: statusAfterMove(position, count),
    moves: [...game.moves, recorded],
    evalCp,
  }
}

function statusAfterMove(position: Chess, repetitionCount: number): GameStatus {
  const outcome = position.outcome()
  if (outcome !== undefined) {
    if (outcome.winner !== undefined) {
      const winner: PlayerId = outcome.winner === 'white' ? 1 : 2
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

function positionFromFen(fen: string): Chess {
  const setup = parseFen(fen).unwrap()
  return Chess.fromSetup(setup).unwrap()
}

export function countTemperaments(
  games: readonly InkGame[],
  side: InkSide,
): Record<TemperamentId, number> {
  const counts: Record<TemperamentId, number> = {
    strong: 0,
    weak: 0,
    steady: 0,
    swingy: 0,
  }
  for (const game of games) {
    const id =
      side === 'player' ? game.playerTemperament : game.computerTemperament
    counts[id] += 1
  }
  return counts
}
