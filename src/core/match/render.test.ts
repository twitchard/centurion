import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { makeUci, parseSquare, squareRank } from 'chessops/util'
import { describe, expect, it } from 'vitest'
import { type Arrow, type MatchState, initMatch } from './model'
import { matchRenderModel } from './render'
import { beginResolution, completeResolution } from './resolve'

function sq(name: string): number {
  const square = parseSquare(name)
  if (square === undefined) {
    throw new Error(`Bad square: ${name}`)
  }
  return square
}

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

function resolveWithFirstLegal(match: MatchState, arrow: Arrow): MatchState {
  const resolution = beginResolution(match, arrow)
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

describe('matchRenderModel', () => {
  it('shows a just-placed arrow immediately while the turn is resolving', () => {
    const match = initMatch(9, { gameCount: 4 })
    const resolution = beginResolution(match, {
      from: sq('e2'),
      to: sq('e4'),
    })
    if (resolution === null) {
      throw new Error('expected a resolution')
    }

    const before = matchRenderModel(match, 1, null)
    expect(before.arrows).toHaveLength(0)

    const during = matchRenderModel(match, 1, null, resolution)
    expect(during.arrows).toEqual([
      {
        from: { col: 4, row: 1 },
        to: { col: 4, row: 3 },
        owner: match.firstPlacer,
        count: 8,
      },
    ])
  })

  it('rank-flips arrows for player 2', () => {
    const match = initMatch(9, { gameCount: 4 })
    const resolution = beginResolution(match, {
      from: sq('e2'),
      to: sq('e4'),
    })
    if (resolution === null) {
      throw new Error('expected a resolution')
    }
    const during = matchRenderModel(match, 2, null, resolution)
    expect(during.arrows).toEqual([
      {
        from: { col: 4, row: 6 },
        to: { col: 4, row: 4 },
        owner: match.firstPlacer,
        count: 8,
      },
    ])
  })

  it('increases cardinality when an arrow is stacked', () => {
    // Turn 1: first placer plays e2->e4. Turn 2: the other player plays
    // a different arrow. Turn 3: the first placer stacks e2->e4 again.
    let match = initMatch(9, { gameCount: 4 })
    const firstPlacer = match.firstPlacer
    match = resolveWithFirstLegal(match, { from: sq('e2'), to: sq('e4') })
    match = resolveWithFirstLegal(match, { from: sq('a7'), to: sq('a6') })
    const resolution = beginResolution(match, {
      from: sq('e2'),
      to: sq('e4'),
    })
    if (resolution === null) {
      throw new Error('expected a resolution')
    }

    const model = matchRenderModel(match, 1, null, resolution)
    expect(model.arrows).toHaveLength(2)
    const stacked = model.arrows[1]
    expect(stacked).toEqual({
      from: { col: 4, row: 1 },
      to: { col: 4, row: 3 },
      owner: firstPlacer,
      count: 16,
    })
    const single = model.arrows[0]
    expect(single?.count).toBe(4)
    expect(resolution.arrows).toHaveLength(2)
    expect(resolution.arrows[1]?.cardinality).toBe(16)
  })

  it('colors pieces by ownership: the viewer is white, the opponent black', () => {
    const match = initMatch(9, { gameCount: 2, whitePlayer: 1 })
    for (const viewer of [1, 2] as const) {
      const model = matchRenderModel(match, viewer, null)
      expect(model.squareLayers.length).toBeGreaterThan(0)
      for (const layer of model.squareLayers) {
        const row = layer.square >> 3
        for (const stack of layer.stacks) {
          const renderedWhite = stack.piece === stack.piece.toUpperCase()
          // Viewer's pieces sit on ranks 1-2 and must render white;
          // the opponent's on ranks 7-8 must render black.
          expect(renderedWhite).toBe(row <= 1)
        }
      }
    }
  })

  it('marks the selected square as the highlight', () => {
    const match = initMatch(9, { gameCount: 2 })
    const model = matchRenderModel(match, 1, sq('d2'))
    expect(model.highlight).toEqual({ col: 3, row: 1 })
  })
})
