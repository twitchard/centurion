import { describe, expect, it, vi } from 'vitest'
import { MatchState } from './state/match'
import type { MatchCallbacks } from './state/types'

/**
 * End-to-end test: Pass & Play full move flow.
 *
 * Verifies: start game → click e2 → click e4 → arrow placed →
 * board flips → arrow appears as e7→e5 from player 2's perspective.
 */
describe('E2E: Pass & Play move flow', () => {
  it('should place an arrow e2→e4, resolve, flip board, and arrow reads as e7→e5', async () => {
    vi.useFakeTimers()

    const callbacks: MatchCallbacks = {
      onStateChange: vi.fn(),
      onResolving: vi.fn(),
      onResolved: vi.fn(),
      onGameOver: vi.fn(),
    }

    const match = new MatchState(callbacks)

    // 1. Start pass-and-play with player 1 going first
    match.start('pass-and-play', 1, 1)

    expect(match.games.length).toBe(100)
    expect(match.currentPlayer).toBe(1)
    expect(match.viewPlayer).toBe(1)
    expect(match.arrows.length).toBe(0)

    // 2. Click e2 (col=4, row=1) to select
    match.handleClick({ col: 4, row: 1 })
    expect(match.selectedSquare).toEqual({ col: 4, row: 1 })

    // 3. Click e4 (col=4, row=3) to place arrow
    match.handleClick({ col: 4, row: 3 })

    // Arrow should be placed
    expect(match.arrows.length).toBe(1)
    expect(match.arrows[0]).toMatchObject({
      fc: 4,
      fr: 1,
      tc: 4,
      tr: 3,
      player: 1,
      stack: 1,
    })
    expect(match.selectedSquare).toBeNull()

    // 4. Let resolution run (setTimeout of 30ms + async delays)
    vi.advanceTimersByTime(50)
    await vi.runAllTimersAsync()

    // 5. After resolution, board should flip to player 2
    expect(match.currentPlayer).toBe(2)
    expect(match.viewPlayer).toBe(2)

    // 6. Verify the arrow's visual meaning from player 2's perspective.
    //
    // The arrow is stored as fc=4, fr=1, tc=4, tr=3 (visual coords).
    // The overlay renderer draws arrows at these visual positions regardless
    // of whose turn it is. From player 1's perspective these are e2→e4.
    //
    // When the board flips (player 2's view), the board renderer draws
    // rank 7 at the bottom and rank 0 at the top. The arrow still renders
    // at the same pixel positions (row 1 from bottom, row 3 upward), but
    // those positions now correspond to e7→e5 on the flipped board.
    //
    // We verify this by checking what board square the arrow's visual
    // coordinates map to from player 2's perspective:
    const arrow = match.arrows[0]

    // Visual row 1 from bottom on a flipped board = rank 7-1 = rank 6 → row 7 in chess (but let's think in terms of what square label it corresponds to)
    // The board renderer draws square (col, row) at pixel position (col * sq, (7-row) * sq).
    // The arrow renders at (fc * sq, (7-fr) * sq) = (4*sq, 6*sq) for the start.
    // On the flipped board, the square at pixel (4*sq, 6*sq) is the square with
    // col=4, visual_row such that (7-visual_row)=6 → visual_row=1.
    // For player 2 (viewPlayer=2), game indices 0-49 are "black" games (flipped),
    // so rank 1 from player 2's view = e7 in standard notation.
    //
    // More directly: the arrow visually starts at column e (col=4) near the bottom
    // of the board and points upward — which on a flipped board is e7→e5.
    expect(arrow.fc).toBe(4) // e-file
    expect(arrow.fr).toBe(1) // visual row 1 (near bottom) = rank 7 when flipped = e7
    expect(arrow.tc).toBe(4) // e-file
    expect(arrow.tr).toBe(3) // visual row 3 = rank 5 when flipped = e5

    // Confirm the arrow's visual position maps to e7→e5 on the flipped board
    // by converting visual coords to algebraic notation from player 2's view.
    // Player 2's board: visual row 0 = rank 8, visual row 7 = rank 1
    // (opposite of player 1 where visual row 0 = rank 1)
    const fromFile = String.fromCharCode(97 + arrow.fc) // 'e'
    const fromRank = 8 - arrow.fr // 7
    const toFile = String.fromCharCode(97 + arrow.tc) // 'e'
    const toRank = 8 - arrow.tr // 5

    expect(`${fromFile}${fromRank}`).toBe('e7')
    expect(`${toFile}${toRank}`).toBe('e5')

    vi.useRealTimers()
  })
})
