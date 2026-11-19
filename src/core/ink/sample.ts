import type { Chess } from 'chessops/chess'
import { isNormal } from 'chessops/types'
import { makeUci, parseUci } from 'chessops/util'
import { MATE_THRESHOLD_CP } from '../match/model'
import type { RankedMove } from '../match/resolve'
import type { RngState } from '../rng'
import { pickWeighted } from '../rng'
import { normalize } from './curve'
import { emphasisFactor } from './emphasis'
import type { InkMark } from './gesture'
import {
  TOP_MOVE_COUNT,
  type TemperamentId,
  temperamentWeights,
} from './temperament'

export interface Candidate {
  readonly uci: string
  readonly from: number
  readonly to: number
  readonly cp: number
  readonly rank: number
}

export interface SoldierDraw {
  readonly base: readonly number[]
  readonly biased: readonly number[]
  readonly favoriteBase: number
  readonly favoriteBiased: number
  /** Biased expected centipawns minus the unled draw, from the mover's side. */
  readonly expectedCpDelta: number
}

/**
 * The engine list is best-first. Keep the first `limit` legal moves in
 * that order; the soldier never sees past the top ten.
 */
export function legalTopMoves(
  position: Chess,
  ranked: readonly RankedMove[],
  limit: number = TOP_MOVE_COUNT,
): Candidate[] {
  const candidates: Candidate[] = []
  for (const entry of ranked) {
    if (candidates.length >= limit) {
      break
    }
    const move = parseUci(entry.uci)
    if (move === undefined || !isNormal(move) || !position.isLegal(move)) {
      continue
    }
    candidates.push({
      uci: makeUci(move),
      from: move.from,
      to: move.to,
      cp: entry.cp,
      rank: candidates.length,
    })
  }
  return candidates
}

export function soldierDraw(
  temperament: TemperamentId,
  candidates: readonly Candidate[],
  marks: readonly InkMark[],
): SoldierDraw {
  const count = candidates.length
  if (count === 0) {
    throw new Error('A soldier needs at least one move')
  }
  const mate = mateIndex(candidates)
  if (mate !== null) {
    const forced = oneHot(count, mate)
    return {
      base: forced,
      biased: forced,
      favoriteBase: mate,
      favoriteBiased: mate,
      expectedCpDelta: 0,
    }
  }

  const curve = temperamentWeights(temperament, count)
  const base = normalize(curve)
  const biased = normalize(
    candidates.map((candidate, index) => {
      const weight = base[index] ?? 0
      return weight * emphasisFactor(marks, candidate.from, candidate.to)
    }),
  )
  const favoriteBase = favoriteIndex(base)
  const favoriteBiased = favoriteIndex(biased)
  return {
    base,
    biased,
    favoriteBase,
    favoriteBiased,
    expectedCpDelta:
      expectedCp(candidates, biased) - expectedCp(candidates, base),
  }
}

export function sampleIndex(
  weights: readonly number[],
  rng: RngState,
): readonly [number, RngState] {
  const [index, next] = pickWeighted(rng, weights)
  if (index < 0) {
    return [0, next]
  }
  return [index, next]
}

function mateIndex(candidates: readonly Candidate[]): number | null {
  let best = -1
  let bestCp = MATE_THRESHOLD_CP
  for (let index = 0; index < candidates.length; index++) {
    const cp = candidates[index]?.cp ?? Number.NEGATIVE_INFINITY
    if (cp >= bestCp) {
      best = index
      bestCp = cp
    }
  }
  return best < 0 ? null : best
}

function oneHot(count: number, index: number): number[] {
  const weights = Array.from({ length: count }, () => 0)
  weights[index] = 1
  return weights
}

function favoriteIndex(weights: readonly number[]): number {
  let best = 0
  let bestWeight = Number.NEGATIVE_INFINITY
  for (let index = 0; index < weights.length; index++) {
    const weight = weights[index] ?? 0
    if (weight > bestWeight) {
      best = index
      bestWeight = weight
    }
  }
  return best
}

function expectedCp(
  candidates: readonly Candidate[],
  weights: readonly number[],
): number {
  let total = 0
  for (let index = 0; index < candidates.length; index++) {
    total += (weights[index] ?? 0) * (candidates[index]?.cp ?? 0)
  }
  return total
}
