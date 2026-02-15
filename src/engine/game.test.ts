import { describe, expect, it } from 'vitest'
import { Game } from './game'
import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK } from './types'

// Helper: square index from file (0-7) and rank (0-7)
function sq(f: number, r: number): number {
  return (r << 3) | f
}

// Helper: set up a board from a map of square -> piece value
function setupBoard(pieces: Record<number, number>): Game {
  const g = new Game()
  g.board.fill(0)
  for (const [s, p] of Object.entries(pieces)) {
    g.board[Number(s)] = p
  }
  return g
}

describe('Game - initial position', () => {
  it('should set up the standard starting position', () => {
    const g = new Game()
    // White back rank
    expect(g.board[sq(0, 0)]).toBe(ROOK)
    expect(g.board[sq(1, 0)]).toBe(KNIGHT)
    expect(g.board[sq(2, 0)]).toBe(BISHOP)
    expect(g.board[sq(3, 0)]).toBe(QUEEN)
    expect(g.board[sq(4, 0)]).toBe(KING)
    expect(g.board[sq(5, 0)]).toBe(BISHOP)
    expect(g.board[sq(6, 0)]).toBe(KNIGHT)
    expect(g.board[sq(7, 0)]).toBe(ROOK)

    // White pawns on rank 1
    for (let f = 0; f < 8; f++) {
      expect(g.board[sq(f, 1)]).toBe(PAWN)
    }

    // Empty middle
    for (let r = 2; r <= 5; r++) {
      for (let f = 0; f < 8; f++) {
        expect(g.board[sq(f, r)]).toBe(0)
      }
    }

    // Black pawns on rank 6
    for (let f = 0; f < 8; f++) {
      expect(g.board[sq(f, 6)]).toBe(-PAWN)
    }

    // Black back rank
    expect(g.board[sq(0, 7)]).toBe(-ROOK)
    expect(g.board[sq(4, 7)]).toBe(-KING)
    expect(g.board[sq(7, 7)]).toBe(-ROOK)
  })

  it('should start with white to move', () => {
    const g = new Game()
    expect(g.turn).toBe(1)
  })

  it('should start with all castling rights', () => {
    const g = new Game()
    expect(g.castling).toBe(0b1111)
  })

  it('should start with no en passant square', () => {
    const g = new Game()
    expect(g.ep).toBe(-1)
  })

  it('should start with result = 0 (ongoing)', () => {
    const g = new Game()
    expect(g.result).toBe(0)
  })
})

describe('Game - move generation', () => {
  it('should generate 20 legal moves from the starting position', () => {
    const g = new Game()
    const moves = g.legalMoves()
    expect(moves.length).toBe(20)
  })

  it('should include pawn single and double pushes', () => {
    const g = new Game()
    const moves = g.legalMoves()
    // e2-e3 (single push): from sq(4,1) to sq(4,2)
    const e2e3 = moves.find((m) => m.from === sq(4, 1) && m.to === sq(4, 2))
    expect(e2e3).toBeDefined()
    // e2-e4 (double push): from sq(4,1) to sq(4,3)
    const e2e4 = moves.find((m) => m.from === sq(4, 1) && m.to === sq(4, 3))
    expect(e2e4).toBeDefined()
  })

  it('should include knight moves from opening position', () => {
    const g = new Game()
    const moves = g.legalMoves()
    // Nb1-a3
    const na3 = moves.find((m) => m.from === sq(1, 0) && m.to === sq(0, 2))
    expect(na3).toBeDefined()
    // Nb1-c3
    const nc3 = moves.find((m) => m.from === sq(1, 0) && m.to === sq(2, 2))
    expect(nc3).toBeDefined()
    // Ng1-f3
    const nf3 = moves.find((m) => m.from === sq(6, 0) && m.to === sq(5, 2))
    expect(nf3).toBeDefined()
    // Ng1-h3
    const nh3 = moves.find((m) => m.from === sq(6, 0) && m.to === sq(7, 2))
    expect(nh3).toBeDefined()
  })

  it('should not include any illegal moves from starting position', () => {
    const g = new Game()
    const moves = g.legalMoves()
    // No bishop, rook, queen, or king moves should be legal
    for (const m of moves) {
      const piece = Math.abs(g.board[m.from])
      expect(piece === PAWN || piece === KNIGHT).toBe(true)
    }
  })
})

describe('Game - pawn captures', () => {
  it('should generate pawn capture moves', () => {
    // White pawn on e4, black pawn on d5 — white should be able to capture
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(4, 3)]: PAWN, // e4
      [sq(3, 4)]: -PAWN, // d5
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    const moves = g.legalMoves()
    const capture = moves.find((m) => m.from === sq(4, 3) && m.to === sq(3, 4))
    expect(capture).toBeDefined()
  })

  it('should not allow pawns to capture friendly pieces', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(4, 3)]: PAWN,
      [sq(3, 4)]: PAWN, // friendly pawn on d5
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    const moves = g.legalMoves()
    const capture = moves.find((m) => m.from === sq(4, 3) && m.to === sq(3, 4))
    expect(capture).toBeUndefined()
  })
})

describe('Game - en passant', () => {
  it('should allow en passant capture', () => {
    // White pawn on e5, black pawn just moved d7-d5
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(4, 4)]: PAWN, // e5
      [sq(3, 4)]: -PAWN, // d5 (just moved)
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0
    g.ep = sq(3, 5) // d6 ep square

    const moves = g.legalMoves()
    const ep = moves.find(
      (m) => m.from === sq(4, 4) && m.to === sq(3, 5) && m.isEp,
    )
    expect(ep).toBeDefined()
  })

  it('should remove the captured pawn on en passant', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(4, 4)]: PAWN,
      [sq(3, 4)]: -PAWN,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0
    g.ep = sq(3, 5)

    const ep = g.legalMoves().find((m) => m.isEp)!
    g.makeMove(ep)

    // The pawn on d5 should be removed
    expect(g.board[sq(3, 4)]).toBe(0)
    // The white pawn should be on d6
    expect(g.board[sq(3, 5)]).toBe(PAWN)
  })

  it('should set en passant square after double pawn push', () => {
    const g = new Game()
    const e2e4 = g
      .legalMoves()
      .find((m) => m.from === sq(4, 1) && m.to === sq(4, 3))!
    g.makeMove(e2e4)
    expect(g.ep).toBe(sq(4, 2)) // e3
  })
})

describe('Game - pawn promotion', () => {
  it('should promote a pawn to queen when reaching the last rank', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(0, 6)]: PAWN, // a7, one step from promotion
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    // Move past the black king — push a7-a8
    const promote = g
      .legalMoves()
      .find((m) => m.from === sq(0, 6) && m.to === sq(0, 7))!
    g.makeMove(promote)

    expect(g.board[sq(0, 7)]).toBe(QUEEN)
  })

  it('should promote black pawn to queen on rank 0', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(0, 1)]: -PAWN, // a2, one step from promotion
      [sq(4, 7)]: -KING,
    })
    g.turn = -1
    g.castling = 0

    const promote = g
      .legalMoves()
      .find((m) => m.from === sq(0, 1) && m.to === sq(0, 0))!
    g.makeMove(promote)

    expect(g.board[sq(0, 0)]).toBe(-QUEEN)
  })
})

describe('Game - castling', () => {
  it('should allow kingside castling when path is clear', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(7, 0)]: ROOK,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0b1000 // white kingside only

    const moves = g.legalMoves()
    const castle = moves.find((m) => m.castle === 'K')
    expect(castle).toBeDefined()
    expect(castle!.from).toBe(sq(4, 0))
    expect(castle!.to).toBe(sq(6, 0))
  })

  it('should move the rook during kingside castling', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(7, 0)]: ROOK,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0b1000

    const castle = g.legalMoves().find((m) => m.castle === 'K')!
    g.makeMove(castle)

    expect(g.board[sq(6, 0)]).toBe(KING)
    expect(g.board[sq(5, 0)]).toBe(ROOK)
    expect(g.board[sq(4, 0)]).toBe(0)
    expect(g.board[sq(7, 0)]).toBe(0)
  })

  it('should allow queenside castling when path is clear', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(0, 0)]: ROOK,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0b0100 // white queenside only

    const moves = g.legalMoves()
    const castle = moves.find((m) => m.castle === 'Q')
    expect(castle).toBeDefined()
  })

  it('should move the rook during queenside castling', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(0, 0)]: ROOK,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0b0100

    const castle = g.legalMoves().find((m) => m.castle === 'Q')!
    g.makeMove(castle)

    expect(g.board[sq(2, 0)]).toBe(KING)
    expect(g.board[sq(3, 0)]).toBe(ROOK)
    expect(g.board[sq(0, 0)]).toBe(0)
    expect(g.board[sq(4, 0)]).toBe(0)
  })

  it('should not allow castling through check', () => {
    // Enemy rook on f7 attacks f1 — blocks kingside castling
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(7, 0)]: ROOK,
      [sq(5, 7)]: -ROOK, // attacks f1
      [sq(0, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0b1000

    const castle = g.legalMoves().find((m) => m.castle === 'K')
    expect(castle).toBeUndefined()
  })

  it('should not allow castling out of check', () => {
    // Enemy rook on e7 attacks e1 — king is in check
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(7, 0)]: ROOK,
      [sq(4, 7)]: -ROOK, // attacks e1
      [sq(0, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0b1000

    const castle = g.legalMoves().find((m) => m.castle === 'K')
    expect(castle).toBeUndefined()
  })

  it('should not allow castling when pieces block the path', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(5, 0)]: BISHOP, // blocks kingside
      [sq(7, 0)]: ROOK,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0b1000

    const castle = g.legalMoves().find((m) => m.castle === 'K')
    expect(castle).toBeUndefined()
  })

  it('should remove castling rights after king moves', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(0, 0)]: ROOK,
      [sq(7, 0)]: ROOK,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0b1100 // white both sides

    const ke1 = g
      .legalMoves()
      .find((m) => m.from === sq(4, 0) && m.to === sq(4, 1))!
    g.makeMove(ke1)

    // White's castling rights should be gone
    expect(g.castling & 0b1100).toBe(0)
  })

  it('should remove kingside castling right after h-rook moves', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(7, 0)]: ROOK,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0b1000

    const rh1 = g
      .legalMoves()
      .find((m) => m.from === sq(7, 0) && m.to === sq(7, 1))!
    g.makeMove(rh1)

    expect(g.castling & 0b1000).toBe(0)
  })

  it('should support black castling', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(4, 7)]: -KING,
      [sq(7, 7)]: -ROOK,
    })
    g.turn = -1
    g.castling = 0b0010 // black kingside

    const castle = g.legalMoves().find((m) => m.castle === 'K')
    expect(castle).toBeDefined()
    expect(castle!.from).toBe(sq(4, 7))
    expect(castle!.to).toBe(sq(6, 7))
  })
})

describe('Game - check detection', () => {
  it('should detect when white is in check', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(4, 7)]: -ROOK, // attacks e1
      [sq(0, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    expect(g.isInCheck()).toBe(true)
  })

  it('should not report check when not in check', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(3, 7)]: -ROOK, // on d-file, doesn't attack e1
      [sq(0, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    expect(g.isInCheck()).toBe(false)
  })

  it('should not allow moves that leave the king in check', () => {
    // King on e1, enemy rook on e8, own pawn on e2
    // Moving the pawn sideways would expose the king (but pawn can't move sideways)
    // Let's use a pinned piece scenario: king e1, own rook e2, enemy rook e8
    const g = setupBoard({
      [sq(4, 0)]: KING, // e1
      [sq(4, 1)]: ROOK, // e2 (pinned)
      [sq(4, 7)]: -ROOK, // e8
      [sq(0, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    const moves = g.legalMoves()
    // The rook on e2 should NOT be able to move off the e-file
    const rookMoves = moves.filter((m) => m.from === sq(4, 1))
    for (const m of rookMoves) {
      expect(m.to & 7).toBe(4) // must stay on e-file
    }
  })
})

describe('Game - checkmate', () => {
  it('should detect checkmate (back rank mate)', () => {
    // Black king on h8, white rook delivers mate on rank 8
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(0, 7)]: ROOK, // a8 gives check
      [sq(7, 7)]: -KING, // h8
      [sq(6, 6)]: -PAWN, // g7 blocks escape
      [sq(7, 6)]: -PAWN, // h7 blocks escape
    })
    g.turn = -1
    g.castling = 0

    g.checkEnd()
    expect(g.result).toBe(1) // white wins
  })

  it("should detect scholar's-mate-style position", () => {
    // King on e8, queen delivers mate on f7
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(5, 6)]: QUEEN, // Qf7#
      [sq(2, 3)]: BISHOP, // Bc4 supports
      [sq(4, 7)]: -KING,
      [sq(3, 7)]: -QUEEN,
      [sq(5, 7)]: -BISHOP,
    })
    g.turn = -1
    g.castling = 0

    g.checkEnd()
    expect(g.result).toBe(1) // white wins
  })
})

describe('Game - stalemate', () => {
  it('should detect stalemate', () => {
    // Black king on a8, white queen on b6, white king on a6
    // Black has no legal moves but is not in check
    const g = setupBoard({
      [sq(0, 5)]: KING, // Ka6
      [sq(1, 4)]: QUEEN, // Qb5
      [sq(0, 7)]: -KING, // Ka8
    })
    g.turn = -1
    g.castling = 0

    g.checkEnd()
    expect(g.result).toBe(2) // draw
  })
})

describe('Game - insufficient material', () => {
  it('should detect K vs K as draw', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    g.checkEnd()
    expect(g.result).toBe(2)
  })

  it('should detect K+B vs K as draw', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(2, 0)]: BISHOP,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    g.checkEnd()
    expect(g.result).toBe(2)
  })

  it('should detect K+N vs K as draw', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(1, 0)]: KNIGHT,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    g.checkEnd()
    expect(g.result).toBe(2)
  })

  it('should NOT detect K+R vs K as draw', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(0, 0)]: ROOK,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    g.checkEnd()
    // This position has legal moves and sufficient material, so no draw yet
    expect(g.result).toBe(0)
  })
})

describe('Game - make/undo move consistency', () => {
  it('should restore the board exactly after undo', () => {
    const g = new Game()
    const boardBefore = Int8Array.from(g.board)
    const turnBefore = g.turn
    const castlingBefore = g.castling
    const epBefore = g.ep
    const halfmoveBefore = g.halfmove

    const move = g.legalMoves()[0]
    g.makeMove(move)
    g.undoMove(move)

    expect(Array.from(g.board)).toEqual(Array.from(boardBefore))
    expect(g.turn).toBe(turnBefore)
    expect(g.castling).toBe(castlingBefore)
    expect(g.ep).toBe(epBefore)
    expect(g.halfmove).toBe(halfmoveBefore)
  })

  it('should restore after multiple make/undo cycles', () => {
    const g = new Game()
    const boardBefore = Int8Array.from(g.board)

    // Play a few moves and undo them all
    const moves = g.legalMoves().slice(0, 5)
    const played: typeof moves = []

    for (const m of moves) {
      g.makeMove(m)
      played.push(m)
      // Make a response move
      const response = g.legalMoves()[0]
      if (response) {
        g.makeMove(response)
        played.push(response)
      }
    }

    // Undo all in reverse
    for (let i = played.length - 1; i >= 0; i--) {
      g.undoMove(played[i])
    }

    expect(Array.from(g.board)).toEqual(Array.from(boardBefore))
    expect(g.turn).toBe(1)
  })

  it('should correctly undo en passant', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(4, 4)]: PAWN,
      [sq(3, 4)]: -PAWN,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0
    g.ep = sq(3, 5)

    const boardBefore = Int8Array.from(g.board)
    const ep = g.legalMoves().find((m) => m.isEp)!
    g.makeMove(ep)

    // After ep, d5 pawn should be gone
    expect(g.board[sq(3, 4)]).toBe(0)

    g.undoMove(ep)

    // Should be fully restored
    expect(Array.from(g.board)).toEqual(Array.from(boardBefore))
  })

  it('should correctly undo castling', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(7, 0)]: ROOK,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0b1000

    const boardBefore = Int8Array.from(g.board)
    const castle = g.legalMoves().find((m) => m.castle === 'K')!
    g.makeMove(castle)

    expect(g.board[sq(6, 0)]).toBe(KING)
    expect(g.board[sq(5, 0)]).toBe(ROOK)

    g.undoMove(castle)

    expect(Array.from(g.board)).toEqual(Array.from(boardBefore))
    expect(g.castling).toBe(0b1000)
  })

  it('should correctly undo promotion', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(0, 6)]: PAWN,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    const boardBefore = Int8Array.from(g.board)
    const promote = g
      .legalMoves()
      .find((m) => m.from === sq(0, 6) && m.to === sq(0, 7))!
    g.makeMove(promote)

    expect(g.board[sq(0, 7)]).toBe(QUEEN)

    g.undoMove(promote)

    expect(Array.from(g.board)).toEqual(Array.from(boardBefore))
  })
})

describe('Game - findLegalMove', () => {
  it('should find a legal move matching from/to', () => {
    const g = new Game()
    const move = g.findLegalMove(sq(4, 1), sq(4, 3)) // e2-e4
    expect(move).not.toBeNull()
    expect(move!.from).toBe(sq(4, 1))
    expect(move!.to).toBe(sq(4, 3))
  })

  it('should return null for illegal moves', () => {
    const g = new Game()
    const move = g.findLegalMove(sq(4, 0), sq(4, 3)) // Ke1-e4 (illegal)
    expect(move).toBeNull()
  })

  it('should return null for out-of-turn piece', () => {
    const g = new Game()
    // Try to move a black pawn on white's turn
    const move = g.findLegalMove(sq(4, 6), sq(4, 5)) // e7-e6
    expect(move).toBeNull()
  })
})

describe('Game - evaluation', () => {
  it('should evaluate the starting position as roughly equal', () => {
    const g = new Game()
    const score = g.evaluate()
    // Should be close to 0 (minor PST differences allowed)
    expect(Math.abs(score)).toBeLessThan(50)
  })

  it('should evaluate a material advantage positively', () => {
    // White has an extra queen
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(3, 3)]: QUEEN,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    expect(g.evaluate()).toBeGreaterThan(0)
  })

  it("should evaluate from the current side's perspective", () => {
    // Same position but black to move — should be negative
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(3, 3)]: QUEEN,
      [sq(4, 7)]: -KING,
    })
    g.turn = -1
    g.castling = 0

    expect(g.evaluate()).toBeLessThan(0)
  })
})

describe('Game - bestMove', () => {
  it('should find a move in the starting position', () => {
    const g = new Game()
    const move = g.bestMove(2)
    expect(move).not.toBeNull()
  })

  it('should capture a hanging queen', () => {
    // White king + knight, black king + undefended queen in knight range
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(3, 3)]: KNIGHT, // d4
      [sq(4, 5)]: -QUEEN, // e6 — knight can capture
      [sq(0, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    const move = g.bestMove(3)
    expect(move).not.toBeNull()
    expect(move!.to).toBe(sq(4, 5)) // capture the queen
  })

  it('should return null when no legal moves exist', () => {
    // Stalemate position
    const g = setupBoard({
      [sq(0, 5)]: KING,
      [sq(1, 4)]: QUEEN,
      [sq(0, 7)]: -KING,
    })
    g.turn = -1
    g.castling = 0

    const move = g.bestMove(3)
    expect(move).toBeNull()
  })
})

describe('Game - sliding pieces', () => {
  it('should generate rook moves along ranks and files', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(3, 3)]: ROOK, // d4
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    const moves = g.legalMoves().filter((m) => m.from === sq(3, 3))
    // Rook on d4 should be able to reach many squares on d-file and 4th rank
    expect(moves.length).toBeGreaterThan(10)

    // Should be able to reach d8 (capture king not possible, but d7 yes)
    const d1 = moves.find((m) => m.to === sq(3, 0))
    expect(d1).toBeDefined()
  })

  it('should generate bishop moves along diagonals', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(3, 3)]: BISHOP, // d4
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    const moves = g.legalMoves().filter((m) => m.from === sq(3, 3))
    // Bishop on d4 has diagonals reaching out in all 4 directions
    expect(moves.length).toBeGreaterThan(8)
  })

  it('should generate queen moves (rook + bishop combined)', () => {
    const g = setupBoard({
      [sq(0, 0)]: KING,
      [sq(3, 3)]: QUEEN, // d4
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    const moves = g.legalMoves().filter((m) => m.from === sq(3, 3))
    // Queen on d4 should have many moves
    expect(moves.length).toBeGreaterThan(20)
  })

  it('should block sliding pieces with intervening pieces', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(0, 3)]: ROOK, // a4
      [sq(3, 3)]: PAWN, // d4 blocks rook from going past d4
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    const rookMoves = g.legalMoves().filter((m) => m.from === sq(0, 3))
    // Rook cannot reach e4 or beyond along the rank (blocked by own pawn on d4)
    const e4 = rookMoves.find((m) => m.to === sq(4, 3))
    expect(e4).toBeUndefined()
  })
})

describe('Game - knight moves', () => {
  it('should generate all 8 knight moves from a central square', () => {
    const g = setupBoard({
      [sq(0, 0)]: KING,
      [sq(3, 3)]: KNIGHT, // d4
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    const moves = g.legalMoves().filter((m) => m.from === sq(3, 3))
    expect(moves.length).toBe(8)
  })

  it('should generate fewer moves from a corner', () => {
    const g = setupBoard({
      [sq(0, 0)]: KNIGHT, // a1
      [sq(4, 0)]: KING,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0

    const moves = g.legalMoves().filter((m) => m.from === sq(0, 0))
    expect(moves.length).toBe(2)
  })
})

describe('Game - halfmove clock and fifty-move rule', () => {
  it('should reset halfmove on pawn move', () => {
    const g = new Game()
    g.halfmove = 10

    const pawnMove = g
      .legalMoves()
      .find((m) => Math.abs(g.board[m.from]) === PAWN)!
    g.makeMove(pawnMove)

    expect(g.halfmove).toBe(0)
  })

  it('should reset halfmove on capture', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(3, 3)]: KNIGHT,
      [sq(4, 5)]: -PAWN, // capturable
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0
    g.halfmove = 30

    const capture = g.legalMoves().find((m) => m.to === sq(4, 5))!
    g.makeMove(capture)

    expect(g.halfmove).toBe(0)
  })

  it('should increment halfmove on quiet moves', () => {
    const g = setupBoard({
      [sq(4, 0)]: KING,
      [sq(3, 3)]: KNIGHT,
      [sq(4, 7)]: -KING,
    })
    g.turn = 1
    g.castling = 0
    g.halfmove = 5

    const quiet = g
      .legalMoves()
      .find((m) => m.from === sq(3, 3) && !g.board[m.to])!
    g.makeMove(quiet)

    expect(g.halfmove).toBe(6)
  })
})

describe('Game - turn switching', () => {
  it('should switch turns after a move', () => {
    const g = new Game()
    expect(g.turn).toBe(1)

    const move = g.legalMoves()[0]
    g.makeMove(move)

    expect(g.turn).toBe(-1)
  })

  it('should generate moves only for the current side', () => {
    const g = new Game()
    for (const m of g.legalMoves()) {
      expect(g.board[m.from]).toBeGreaterThan(0) // white pieces are positive
    }

    g.makeMove(g.legalMoves()[0])

    for (const m of g.legalMoves()) {
      expect(g.board[m.from]).toBeLessThan(0) // black pieces are negative
    }
  })
})
