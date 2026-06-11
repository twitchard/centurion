import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { makeUci, parseSquare, squareRank } from 'chessops/util'
import { describe, expect, it } from 'vitest'
import { planResolutionAnimation, resolutionAnimationFrame } from './animate'
import { type Arrow, type MatchState, initMatch } from './model'
import { matchRenderModel } from './render'
import {
  type PendingResolution,
  beginResolution,
  completeResolution,
} from './resolve'

function sq(name: string): number {
  const square = parseSquare(name)
  if (square === undefined) {
    throw new Error(`Bad square: ${name}`)
  }
  return square
}

/** Stand-in for Stockfish in tests: the first legal move per position. */
function firstLegalUci(fen: string): string {
  const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
  for (const [from, dests] of position.allDests()) {
    for (const to of dests) {
      const isPawn = position.board.getRole(from) === 'pawn'
      const toRank = squareRank(to)
      if (isPawn && (toRank === 0 || toRank === 7)) {
        return makeUci({ from, to, promotion: 'queen' })
      }
      return makeUci({ from, to })
    }
  }
  throw new Error(`No legal move in ${fen}`)
}

function resolveTurn(match: MatchState, arrow: Arrow): MatchState {
  const resolution: PendingResolution | null = beginResolution(match, arrow)
  if (resolution === null) {
    throw new Error('match already finished')
  }
  const next = completeResolution(
    resolution,
    resolution.pending.map((entry) => firstLegalUci(entry.fen)),
  )
  if (next === null) {
    throw new Error('resolution rejected its own engine moves')
  }
  return next
}

const TOTAL_MS = 2000

function planFixture() {
  const before = initMatch(7, { gameCount: 10, whitePlayer: 1 })
  const after = resolveTurn(before, { from: sq('e2'), to: sq('e4') })
  const plan = planResolutionAnimation(before, after, 1, TOTAL_MS)
  if (plan === null) {
    throw new Error('expected an animation plan')
  }
  return { before, after, plan }
}

describe('planResolutionAnimation', () => {
  it('schedules one move per advanced game, slides before fades', () => {
    const { plan } = planFixture()
    expect(plan.moves).toHaveLength(10)

    const slides = plan.moves.filter((move) => move.source === 'arrow')
    const fades = plan.moves.filter((move) => move.source === 'engine')
    expect(slides.length).toBeGreaterThan(0)
    expect(fades.length).toBeGreaterThan(0)

    const lastSlideEnd = Math.max(
      ...slides.map((move) => move.startMs + move.durationMs),
    )
    const firstFadeStart = Math.min(...fades.map((move) => move.startMs))
    expect(firstFadeStart).toBeGreaterThanOrEqual(lastSlideEnd)

    for (const move of plan.moves) {
      expect(move.startMs).toBeGreaterThanOrEqual(0)
      expect(move.startMs + move.durationMs).toBeLessThanOrEqual(TOTAL_MS)
    }
  })

  it('rejects state pairs that are not a single-turn step', () => {
    const { before, after } = planFixture()
    expect(planResolutionAnimation(before, before, 1, TOTAL_MS)).toBeNull()
    const skipped = resolveTurn(after, { from: sq('d2'), to: sq('d4') })
    expect(planResolutionAnimation(before, skipped, 1, TOTAL_MS)).toBeNull()
  })

  it('plans engine fades when the black owner opens against white plies', () => {
    const before = initMatch(7, {
      gameCount: 2,
      whitePlayer: 2,
      firstPlacer: 1,
    })
    // Viewer 1 owns black; their visual e2->e4 is read through the flip
    // as e7->e5, which can never match white's turn-1 half-move, so all
    // games fall through to the engine.
    const after = resolveTurn(before, { from: sq('e2'), to: sq('e4') })
    const plan = planResolutionAnimation(before, after, 1, TOTAL_MS)
    if (plan === null) {
      throw new Error('expected an animation plan')
    }
    expect(plan.moves).toHaveLength(2)
    for (const move of plan.moves) {
      expect(move.source).toBe('engine')
      expect(move.from).toBeGreaterThanOrEqual(0)
      expect(move.from).toBeLessThan(64)
      expect(move.to).toBeGreaterThanOrEqual(0)
      expect(move.to).toBeLessThan(64)
    }
  })
})

describe('resolutionAnimationFrame', () => {
  it('shows the old board before any move starts', () => {
    const { before, plan } = planFixture()
    const firstStart = Math.min(...plan.moves.map((move) => move.startMs))
    const frame = resolutionAnimationFrame(plan, firstStart - 1)
    expect(frame.done).toBe(false)
    expect(frame.model.squareLayers).toEqual(
      matchRenderModel(before, 1, null).squareLayers,
    )
  })

  it('lifts in-flight pieces into overlays', () => {
    const { plan } = planFixture()
    const slide = plan.moves.find((move) => move.source === 'arrow')
    if (slide === undefined) {
      throw new Error('expected a slide move')
    }
    const frame = resolutionAnimationFrame(
      plan,
      slide.startMs + slide.durationMs / 2,
    )
    const sliding = frame.overlays.filter((entry) => entry.kind === 'slide')
    expect(sliding.length).toBeGreaterThan(0)
    const first = sliding[0]
    expect(first?.progress).toBeGreaterThan(0)
    expect(first?.progress).toBeLessThan(1)
  })

  it('settles on the new board once the timeline completes', () => {
    const { after, plan } = planFixture()
    const frame = resolutionAnimationFrame(plan, plan.totalMs)
    expect(frame.done).toBe(true)
    expect(frame.overlays).toHaveLength(0)
    expect(frame.model.squareLayers).toEqual(
      matchRenderModel(after, 1, null).squareLayers,
    )
  })
})
