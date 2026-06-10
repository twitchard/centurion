import { parseSquare } from 'chessops/util'
import { describe, expect, it } from 'vitest'
import { initMatch } from './model'
import { matchRenderModel } from './render'
import { beginResolution } from './resolve'

function sq(name: string): number {
  const square = parseSquare(name)
  if (square === undefined) {
    throw new Error(`Bad square: ${name}`)
  }
  return square
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
      { from: { col: 4, row: 1 }, to: { col: 4, row: 3 } },
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
      { from: { col: 4, row: 6 }, to: { col: 4, row: 4 } },
    ])
  })

  it('marks the selected square as the highlight', () => {
    const match = initMatch(9, { gameCount: 2 })
    const model = matchRenderModel(match, 1, sq('d2'))
    expect(model.highlight).toEqual({ col: 3, row: 1 })
  })
})
