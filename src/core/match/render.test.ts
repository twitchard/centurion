import { describe, expect, it } from 'vitest'
import { initMatch } from './model'
import { actualSquare, matchRenderModel, visualSquare } from './render'

describe('square projection', () => {
  it('round-trips visual and actual squares for each owner and viewer', () => {
    const match = initMatch(9, { gameCount: 1, whitePlayer: 1 })
    const game = match.games[0]
    if (game === undefined) {
      throw new Error('missing game')
    }
    for (const viewer of [1, 2] as const) {
      for (let square = 0; square < 64; square++) {
        const visual = visualSquare(square, game.whiteOwner, viewer)
        expect(actualSquare(visual, game.whiteOwner, viewer)).toBe(square)
      }
    }
  })
})

describe('matchRenderModel', () => {
  it('colors pieces by ownership: the viewer is white, the opponent black', () => {
    const match = initMatch(9, { gameCount: 2, whitePlayer: 1 })
    for (const viewer of [1, 2] as const) {
      const model = matchRenderModel(match, viewer)
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

  it('carries the viewer and renders no arrow layer', () => {
    const match = initMatch(9, { gameCount: 2 })
    const model = matchRenderModel(match, 2)
    expect(model.viewerPlayer).toBe(2)
    expect(model.arrows).toHaveLength(0)
    expect(model.positionCount).toBe(1)
  })

  it('drops finished games from the superposition', () => {
    const match = initMatch(9, { gameCount: 2 })
    const [first, second] = match.games
    if (first === undefined || second === undefined) {
      throw new Error('missing games')
    }
    const withFinished = {
      ...match,
      games: [first, { ...second, status: { tag: 'won', by: 1 } as const }],
    }
    const model = matchRenderModel(withFinished, 1)
    expect(model.positionCount).toBe(1)
  })
})
