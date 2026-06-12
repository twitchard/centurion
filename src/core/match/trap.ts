import { makeFen } from 'chessops/fen'
import { isNormal } from 'chessops/types'
import { parseUci } from 'chessops/util'
import type { Arrow, MatchGame, MatchState } from './model'
import { flipSquare } from './resolve'

/**
 * The games the solo opponent studies for its trap arrow: every still
 * active game, id-aligned with its current FEN.
 */
export interface TrapTargets {
  readonly gameIds: readonly number[]
  readonly fens: readonly string[]
}

export function trapTargets(match: MatchState): TrapTargets {
  const active = match.games.filter((game) => game.status.tag === 'active')
  return {
    gameIds: active.map((game) => game.id),
    fens: active.map((game) => makeFen(game.position.toSetup())),
  }
}

/**
 * Choose the solo opponent's trap arrow. Each game's worst move (UCI,
 * board coordinates, aligned with `games`) is translated into the
 * canonical arrow frame — the inverse of the flip `arrowMoveForGame`
 * applies — and the square pair that is the worst move in the most
 * games wins. Ties break toward the lowest square pair so the choice
 * is deterministic regardless of game order. Returns null when no move
 * translates (e.g. every UCI string is malformed).
 */
export function chooseTrapArrow(
  games: readonly MatchGame[],
  worstMoves: readonly string[],
): Arrow | null {
  const counts = new Map<number, number>()
  for (let index = 0; index < games.length; index++) {
    const game = games[index]
    const uci = worstMoves[index]
    if (game === undefined || uci === undefined) {
      continue
    }
    const move = parseUci(uci)
    if (move === undefined || !isNormal(move)) {
      continue
    }
    const from = game.whiteOwner === 1 ? move.from : flipSquare(move.from)
    const to = game.whiteOwner === 1 ? move.to : flipSquare(move.to)
    const key = from * 64 + to
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  let bestKey = -1
  let bestCount = 0
  for (const [key, count] of counts) {
    if (count > bestCount || (count === bestCount && key < bestKey)) {
      bestKey = key
      bestCount = count
    }
  }
  if (bestKey < 0) {
    return null
  }
  return { from: Math.floor(bestKey / 64), to: bestKey % 64 }
}
