import { describe, expect, it, vi } from 'vitest'
import { MatchState } from './match'
import type { MatchCallbacks } from './types'

function makeCallbacks(): MatchCallbacks {
  return {
    onStateChange: vi.fn(),
    onResolving: vi.fn(),
    onResolved: vi.fn(),
    onGameOver: vi.fn(),
    onSendMessage: vi.fn(),
  }
}

describe('MatchState - initialization', () => {
  it('should create 100 games on start', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    expect(ms.games.length).toBe(100)
  })

  it('should start with zero scores', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    expect(ms.scores).toEqual([0, 0])
  })

  it('should start with no arrows', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    expect(ms.arrows.length).toBe(0)
  })

  it('should start with all games active', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    expect(ms.activeCount()).toBe(100)
  })

  it('should use the specified first player', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 2)

    expect(ms.currentPlayer).toBe(2)
  })

  it('should not be resolving or over after start', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    expect(ms.resolving).toBe(false)
    expect(ms.matchOver).toBe(false)
  })

  it('should call onStateChange on start', () => {
    const cb = makeCallbacks()
    const ms = new MatchState(cb)
    ms.start('pass-and-play', 1, 1)

    expect(cb.onStateChange).toHaveBeenCalled()
  })

  it('should set the game mode', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('online-host', 1, 1)

    expect(ms.mode).toBe('online-host')
  })

  it('should reset state on subsequent start calls', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)
    ms.ply = 10
    ms.scores = [5, 3]

    ms.start('pass-and-play', 1, 1)

    expect(ms.ply).toBe(0)
    expect(ms.scores).toEqual([0, 0])
  })
})

describe('MatchState - click handling', () => {
  it('should select a square on first click', () => {
    const cb = makeCallbacks()
    const ms = new MatchState(cb)
    ms.start('pass-and-play', 1, 1)

    ms.handleClick({ col: 4, row: 1 })

    expect(ms.selectedSquare).toEqual({ col: 4, row: 1 })
    expect(cb.onStateChange).toHaveBeenCalled()
  })

  it('should deselect on clicking the same square', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    ms.handleClick({ col: 4, row: 1 })
    ms.handleClick({ col: 4, row: 1 })

    expect(ms.selectedSquare).toBeNull()
  })

  it('should ignore clicks when resolving', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)
    ms.resolving = true

    ms.handleClick({ col: 4, row: 1 })

    expect(ms.selectedSquare).toBeNull()
  })

  it('should ignore clicks when match is over', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)
    ms.matchOver = true

    ms.handleClick({ col: 4, row: 1 })

    expect(ms.selectedSquare).toBeNull()
  })
})

describe('MatchState - isLocalTurn', () => {
  it('should always be local turn in pass-and-play', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    expect(ms.isLocalTurn()).toBe(true)

    ms.currentPlayer = 2
    expect(ms.isLocalTurn()).toBe(true)
  })

  it('should only be local turn when currentPlayer matches in online mode', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('online-host', 1, 1)
    ms.currentPlayer = 1

    expect(ms.isLocalTurn()).toBe(true)

    ms.currentPlayer = 2
    expect(ms.isLocalTurn()).toBe(false)
  })
})

describe('MatchState - viewPlayer', () => {
  it('should return currentPlayer in pass-and-play', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    expect(ms.viewPlayer).toBe(1)

    ms.currentPlayer = 2
    expect(ms.viewPlayer).toBe(2)
  })

  it('should return localPlayer in online mode', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('online-host', 1, 1)

    expect(ms.viewPlayer).toBe(1)

    ms.currentPlayer = 2
    expect(ms.viewPlayer).toBe(1) // still local player's view
  })
})

describe('MatchState - activeCount', () => {
  it('should count only non-finished games', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    // Mark some games as finished
    ms.games[0].result = 1
    ms.games[1].result = -1
    ms.games[2].result = 2

    expect(ms.activeCount()).toBe(97)
  })

  it('should return 0 when all games are done', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    for (const g of ms.games) g.result = 2

    expect(ms.activeCount()).toBe(0)
  })
})

describe('MatchState - arrow placement', () => {
  it('should place an arrow on click sequence', () => {
    vi.useFakeTimers()
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    ms.handleClick({ col: 4, row: 1 }) // select e2
    ms.handleClick({ col: 4, row: 3 }) // target e4

    expect(ms.arrows.length).toBe(1)
    expect(ms.arrows[0]).toMatchObject({
      fc: 4,
      fr: 1,
      tc: 4,
      tr: 3,
      player: 1,
      stack: 1,
    })

    vi.useRealTimers()
  })

  it('should stack arrows on the same path', () => {
    vi.useFakeTimers()
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    // Place first arrow
    ms.handleClick({ col: 4, row: 1 })
    ms.handleClick({ col: 4, row: 3 })

    // Wait for resolve timer, then change turn back for testing
    vi.runAllTimers()

    // Manually reset for second arrow on same path
    ms.resolving = false
    ms.currentPlayer = 1

    ms.handleClick({ col: 4, row: 1 })
    ms.handleClick({ col: 4, row: 3 })

    expect(ms.arrows.length).toBe(1)
    expect(ms.arrows[0].stack).toBe(2)

    vi.useRealTimers()
  })

  it('should clear selection after placing an arrow', () => {
    vi.useFakeTimers()
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    ms.handleClick({ col: 4, row: 1 })
    ms.handleClick({ col: 4, row: 3 })

    expect(ms.selectedSquare).toBeNull()

    vi.useRealTimers()
  })
})

describe('MatchState - online messaging', () => {
  it('should send arrow message in online-host mode', () => {
    vi.useFakeTimers()
    const cb = makeCallbacks()
    const ms = new MatchState(cb)
    ms.start('online-host', 1, 1)

    ms.handleClick({ col: 4, row: 1 })
    ms.handleClick({ col: 4, row: 3 })

    expect(cb.onSendMessage).toHaveBeenCalledWith({
      type: 'arrow',
      fc: 4,
      fr: 1,
      tc: 4,
      tr: 3,
    })

    vi.useRealTimers()
  })

  it('should send arrow message in online-guest mode', () => {
    vi.useFakeTimers()
    const cb = makeCallbacks()
    const ms = new MatchState(cb)
    ms.start('online-guest', 1, 1)

    ms.handleClick({ col: 4, row: 1 })
    ms.handleClick({ col: 4, row: 3 })

    expect(cb.onSendMessage).toHaveBeenCalledWith({
      type: 'arrow',
      fc: 4,
      fr: 1,
      tc: 4,
      tr: 3,
    })

    vi.useRealTimers()
  })

  it('should not send messages in pass-and-play mode', () => {
    vi.useFakeTimers()
    const cb = makeCallbacks()
    const ms = new MatchState(cb)
    ms.start('pass-and-play', 1, 1)

    ms.handleClick({ col: 4, row: 1 })
    ms.handleClick({ col: 4, row: 3 })

    // onSendMessage is called via callbacks, but placeArrow checks the mode
    // In pass-and-play, it should NOT send network messages
    expect(cb.onSendMessage).not.toHaveBeenCalled()

    vi.useRealTimers()
  })
})

describe('MatchState - pass', () => {
  it('should not pass when resolving', () => {
    vi.useFakeTimers()
    const cb = makeCallbacks()
    const ms = new MatchState(cb)
    ms.start('pass-and-play', 1, 1)
    ms.resolving = true

    ms.pass()

    // onResolving should not have been called (resolve not triggered)
    expect(cb.onResolving).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('should not pass when match is over', () => {
    vi.useFakeTimers()
    const cb = makeCallbacks()
    const ms = new MatchState(cb)
    ms.start('pass-and-play', 1, 1)
    ms.matchOver = true

    ms.pass()

    expect(cb.onResolving).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('should send pass message in online mode', () => {
    vi.useFakeTimers()
    const cb = makeCallbacks()
    const ms = new MatchState(cb)
    ms.start('online-host', 1, 1)

    ms.pass()

    expect(cb.onSendMessage).toHaveBeenCalledWith({ type: 'pass' })

    vi.useRealTimers()
  })
})

describe('MatchState - receiveArrow', () => {
  it('should add a new arrow from remote peer', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('online-host', 1, 1)

    ms.receiveArrow(4, 6, 4, 4)

    expect(ms.arrows.length).toBe(1)
    expect(ms.arrows[0]).toMatchObject({
      fc: 4,
      fr: 6,
      tc: 4,
      tr: 4,
      stack: 1,
    })
  })

  it('should stack received arrows on existing ones', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('online-host', 1, 1)

    ms.receiveArrow(4, 6, 4, 4)
    ms.receiveArrow(4, 6, 4, 4)

    expect(ms.arrows.length).toBe(1)
    expect(ms.arrows[0].stack).toBe(2)
  })
})

describe('MatchState - receiveMessage', () => {
  it('should handle arrow messages', () => {
    vi.useFakeTimers()
    const ms = new MatchState(makeCallbacks())
    ms.start('online-host', 1, 1)

    ms.receiveMessage({ type: 'arrow', fc: 4, fr: 6, tc: 4, tr: 4 })

    expect(ms.arrows.length).toBe(1)

    vi.useRealTimers()
  })

  it('should handle init messages for guest', () => {
    const cb = makeCallbacks()
    const ms = new MatchState(cb)
    ms.start('online-guest', 2, 1)

    ms.receiveMessage({ type: 'init', firstPlayer: 1 })

    expect(ms.mode).toBe('online-guest')
    expect(ms.localPlayer).toBe(2)
    expect(ms.currentPlayer).toBe(1)
  })

  it('should handle resolved messages', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('online-guest', 2, 1)

    // Apply a simple legal move to game 0: e2-e4
    const from = (1 << 3) | 4 // sq(4,1) = e2
    const to = (3 << 3) | 4 // sq(4,3) = e4

    ms.applyResolution([{ gameIndex: 0, from, to }])

    // Verify the move was applied: e2 should be empty, e4 should have a pawn
    expect(ms.games[0].board[from]).toBe(0)
  })
})

describe('MatchState - scoring', () => {
  it('should score white wins for games 0-49 to player 1', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    // Simulate game 5 (index < 50) ending with white win
    ms.games[5].result = 1
    ms.games[5].scored = false

    // Trigger scoring by applying an empty resolution
    ms.applyResolution([])

    expect(ms.scores[0]).toBe(1) // player 1 gets the point
    expect(ms.scores[1]).toBe(0)
  })

  it('should score black wins for games 0-49 to player 2', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    ms.games[5].result = -1
    ms.games[5].scored = false

    ms.applyResolution([])

    expect(ms.scores[0]).toBe(0)
    expect(ms.scores[1]).toBe(1) // player 2 gets the point
  })

  it('should score white wins for games 50-99 to player 2', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    // Game 60 (index >= 50) with white win — player 2 plays white for these
    ms.games[60].result = 1
    ms.games[60].scored = false

    ms.applyResolution([])

    expect(ms.scores[0]).toBe(0)
    expect(ms.scores[1]).toBe(1) // player 2 gets the point
  })

  it('should not score draws', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    ms.games[0].result = 2
    ms.games[0].scored = false

    ms.applyResolution([])

    expect(ms.scores[0]).toBe(0)
    expect(ms.scores[1]).toBe(0)
  })

  it('should not double-score already scored games', () => {
    const ms = new MatchState(makeCallbacks())
    ms.start('pass-and-play', 1, 1)

    ms.games[0].result = 1
    ms.games[0].scored = true // already scored

    ms.applyResolution([])

    expect(ms.scores[0]).toBe(0)
  })
})
