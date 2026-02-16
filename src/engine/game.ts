import {
  BACK_RANK,
  BISHOP_DIRS,
  KING_DIRS,
  KNIGHT_DIRS,
  PIECE_VALUES,
  PST_KING,
  PST_KNIGHT,
  PST_PAWN,
  ROOK_DIRS,
  SLIDE_DIRS,
} from './constants'
import {
  BISHOP,
  type Color,
  type GameResult,
  KING,
  KNIGHT,
  type Move,
  PAWN,
  QUEEN,
  ROOK,
  type Square,
  type UndoInfo,
} from './types'

function file(sq: Square): number {
  return sq & 7
}
function rank(sq: Square): number {
  return sq >> 3
}
function sq(f: number, r: number): Square {
  return (r << 3) | f
}

export class Game {
  board: Int8Array
  turn: Color = 1
  castling = 0b1111 // KQkq bits: 8=wK, 4=wQ, 2=bK, 1=bQ
  ep: Square = -1
  halfmove = 0
  ply = 0
  result: GameResult = 0
  scored = false
  private posHistory: string[] = []

  constructor() {
    this.board = new Int8Array(64)
    this.init()
  }

  private init(): void {
    for (let f = 0; f < 8; f++) {
      this.board[sq(f, 0)] = BACK_RANK[f]
      this.board[sq(f, 1)] = PAWN
      this.board[sq(f, 6)] = -PAWN
      this.board[sq(f, 7)] = -BACK_RANK[f]
    }
    this.posHistory.push(this.posKey())
  }

  private posKey(): string {
    let s = ''
    for (let i = 0; i < 64; i++) s += String.fromCharCode(this.board[i] + 70)
    return `${s}${this.turn}${this.castling}${this.ep}`
  }

  private isThreefold(): boolean {
    const key = this.posKey()
    let count = 0
    for (const p of this.posHistory) if (p === key) count++
    return count >= 3
  }

  private isInsufficient(): boolean {
    let wMinor = 0
    let bMinor = 0
    for (let i = 0; i < 64; i++) {
      const p = this.board[i]
      const t = Math.abs(p)
      if (!t || t === KING) continue
      if (t === PAWN || t === ROOK || t === QUEEN) return false
      if (p > 0) wMinor++
      else bMinor++
    }
    return wMinor <= 1 && bMinor <= 1
  }

  private isAttacked(target: Square, byColor: Color): boolean {
    // Pawn attacks
    const pawnRank = rank(target) + (byColor > 0 ? -1 : 1)
    if (pawnRank >= 0 && pawnRank < 8) {
      for (const df of [-1, 1]) {
        const nf = file(target) + df
        if (
          nf >= 0 &&
          nf < 8 &&
          this.board[sq(nf, pawnRank)] === byColor * PAWN
        )
          return true
      }
    }
    // Knight attacks
    for (const [df, dr] of KNIGHT_DIRS) {
      const nf = file(target) + df
      const nr = rank(target) + dr
      if (
        nf >= 0 &&
        nf < 8 &&
        nr >= 0 &&
        nr < 8 &&
        this.board[sq(nf, nr)] === byColor * KNIGHT
      )
        return true
    }
    // King attacks
    for (const [df, dr] of KING_DIRS) {
      const nf = file(target) + df
      const nr = rank(target) + dr
      if (
        nf >= 0 &&
        nf < 8 &&
        nr >= 0 &&
        nr < 8 &&
        this.board[sq(nf, nr)] === byColor * KING
      )
        return true
    }
    // Rook/Queen slides
    for (const [df, dr] of ROOK_DIRS) {
      let nf = file(target) + df
      let nr = rank(target) + dr
      while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        const p = this.board[sq(nf, nr)]
        if (p) {
          if (p === byColor * ROOK || p === byColor * QUEEN) return true
          break
        }
        nf += df
        nr += dr
      }
    }
    // Bishop/Queen slides
    for (const [df, dr] of BISHOP_DIRS) {
      let nf = file(target) + df
      let nr = rank(target) + dr
      while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        const p = this.board[sq(nf, nr)]
        if (p) {
          if (p === byColor * BISHOP || p === byColor * QUEEN) return true
          break
        }
        nf += df
        nr += dr
      }
    }
    return false
  }

  private findKing(color: Color): Square {
    for (let i = 0; i < 64; i++) {
      if (this.board[i] === color * KING) return i
    }
    return -1
  }

  isInCheck(color?: Color): boolean {
    const c = color ?? this.turn
    const kingSq = this.findKing(c)
    return kingSq >= 0 && this.isAttacked(kingSq, -c as Color)
  }

  /** Generate all pseudo-legal moves for current side */
  pseudoMoves(): Move[] {
    const moves: Move[] = []
    const c = this.turn

    for (let s = 0; s < 64; s++) {
      const piece = this.board[s]
      if (!piece || Math.sign(piece) !== c) continue

      const type = Math.abs(piece)
      const fi = file(s)
      const ri = rank(s)

      if (type === PAWN) {
        const dir = c as number
        const nextRank = ri + dir
        if (nextRank < 0 || nextRank > 7) continue

        // Forward
        const fwd = sq(fi, nextRank)
        if (!this.board[fwd]) {
          moves.push({ from: s, to: fwd })
          // Double push
          if ((c === 1 && ri === 1) || (c === -1 && ri === 6)) {
            const fwd2 = sq(fi, ri + 2 * dir)
            if (!this.board[fwd2]) moves.push({ from: s, to: fwd2 })
          }
        }
        // Captures
        for (const df of [-1, 1]) {
          const nf = fi + df
          if (nf < 0 || nf > 7) continue
          const target = sq(nf, nextRank)
          if (this.board[target] && Math.sign(this.board[target]) !== c) {
            moves.push({ from: s, to: target })
          }
          if (target === this.ep) {
            moves.push({ from: s, to: target, isEp: true })
          }
        }
      } else if (type === KNIGHT) {
        for (const [df, dr] of KNIGHT_DIRS) {
          const nf = fi + df
          const nr = ri + dr
          if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue
          const target = sq(nf, nr)
          if (!this.board[target] || Math.sign(this.board[target]) !== c) {
            moves.push({ from: s, to: target })
          }
        }
      } else if (type === KING) {
        for (const [df, dr] of KING_DIRS) {
          const nf = fi + df
          const nr = ri + dr
          if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue
          const target = sq(nf, nr)
          if (!this.board[target] || Math.sign(this.board[target]) !== c) {
            moves.push({ from: s, to: target })
          }
        }
        // Castling
        const cr = c === 1 ? 0 : 7
        if (fi === 4 && ri === cr) {
          const enemy = -c as Color
          // Kingside
          if (
            (c === 1 ? this.castling & 8 : this.castling & 2) &&
            !this.board[sq(5, cr)] &&
            !this.board[sq(6, cr)] &&
            this.board[sq(7, cr)] === c * ROOK &&
            !this.isAttacked(sq(4, cr), enemy) &&
            !this.isAttacked(sq(5, cr), enemy) &&
            !this.isAttacked(sq(6, cr), enemy)
          ) {
            moves.push({ from: s, to: sq(6, cr), castle: 'K' })
          }
          // Queenside
          if (
            (c === 1 ? this.castling & 4 : this.castling & 1) &&
            !this.board[sq(3, cr)] &&
            !this.board[sq(2, cr)] &&
            !this.board[sq(1, cr)] &&
            this.board[sq(0, cr)] === c * ROOK &&
            !this.isAttacked(sq(4, cr), enemy) &&
            !this.isAttacked(sq(3, cr), enemy) &&
            !this.isAttacked(sq(2, cr), enemy)
          ) {
            moves.push({ from: s, to: sq(2, cr), castle: 'Q' })
          }
        }
      } else {
        // Sliding pieces
        const dirs = SLIDE_DIRS[type]
        for (const [df, dr] of dirs) {
          let nf = fi + df
          let nr = ri + dr
          while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
            const target = sq(nf, nr)
            const tp = this.board[target]
            if (!tp) {
              moves.push({ from: s, to: target })
            } else {
              if (Math.sign(tp) !== c) moves.push({ from: s, to: target })
              break
            }
            nf += df
            nr += dr
          }
        }
      }
    }
    return moves
  }

  makeMove(m: Move): UndoInfo {
    const c = this.turn
    const undo: UndoInfo = {
      move: m,
      captured: this.board[m.to],
      castling: this.castling,
      ep: this.ep,
      halfmove: this.halfmove,
      promoted: false,
      epCapture: 0,
    }

    const type = Math.abs(this.board[m.from])
    this.board[m.to] = this.board[m.from]
    this.board[m.from] = 0

    this.halfmove++
    if (type === PAWN || undo.captured) this.halfmove = 0

    // Promotion (always queen)
    if (type === PAWN && (rank(m.to) === 0 || rank(m.to) === 7)) {
      this.board[m.to] = c * QUEEN
      undo.promoted = true
    }

    // En passant capture
    if (m.isEp) {
      const epSq = sq(file(m.to), rank(m.from))
      undo.epCapture = this.board[epSq]
      this.board[epSq] = 0
    }

    // Set en passant square
    this.ep = -1
    if (type === PAWN && Math.abs(rank(m.to) - rank(m.from)) === 2) {
      this.ep = sq(file(m.from), (rank(m.from) + rank(m.to)) >> 1)
    }

    // Castling rook move
    if (m.castle) {
      const cr = c === 1 ? 0 : 7
      if (m.castle === 'K') {
        this.board[sq(5, cr)] = this.board[sq(7, cr)]
        this.board[sq(7, cr)] = 0
      } else {
        this.board[sq(3, cr)] = this.board[sq(0, cr)]
        this.board[sq(0, cr)] = 0
      }
    }

    // Update castling rights
    if (type === KING) {
      if (c === 1) this.castling &= 0b0011
      else this.castling &= 0b1100
    }
    if (type === ROOK) {
      if (m.from === 0) this.castling &= ~4
      if (m.from === 7) this.castling &= ~8
      if (m.from === 56) this.castling &= ~1
      if (m.from === 63) this.castling &= ~2
    }
    if (m.to === 0) this.castling &= ~4
    if (m.to === 7) this.castling &= ~8
    if (m.to === 56) this.castling &= ~1
    if (m.to === 63) this.castling &= ~2

    this.turn = -c as Color
    this.ply++
    this.posHistory.push(this.posKey())
    return undo
  }

  undoMove(info: UndoInfo): void {
    this.posHistory.pop()
    this.ply--
    this.turn = -this.turn as Color
    const c = this.turn
    const m = info.move

    if (info.promoted) this.board[m.to] = c * PAWN
    this.board[m.from] = this.board[m.to]
    this.board[m.to] = info.captured

    if (m.isEp) {
      this.board[sq(file(m.to), rank(m.from))] = info.epCapture
    }

    if (m.castle) {
      const cr = c === 1 ? 0 : 7
      if (m.castle === 'K') {
        this.board[sq(7, cr)] = this.board[sq(5, cr)]
        this.board[sq(5, cr)] = 0
      } else {
        this.board[sq(0, cr)] = this.board[sq(3, cr)]
        this.board[sq(3, cr)] = 0
      }
    }

    this.castling = info.castling
    this.ep = info.ep
    this.halfmove = info.halfmove
  }

  /** Generate legal moves only */
  legalMoves(): Move[] {
    const c = this.turn
    const legal: Move[] = []
    for (const m of this.pseudoMoves()) {
      const undo = this.makeMove(m)
      if (!this.isInCheck(c)) legal.push(m)
      this.undoMove(undo)
    }
    return legal
  }

  /** Check for game end conditions */
  checkEnd(): void {
    if (this.result) return
    const legal = this.legalMoves()
    if (legal.length === 0) {
      this.result = this.isInCheck() ? (-this.turn as -1 | 1) : 2
      return
    }
    if (this.halfmove >= 100 || this.isThreefold() || this.isInsufficient()) {
      this.result = 2
    }
  }

  /** Static evaluation from current side's perspective */
  evaluate(): number {
    let score = 0
    for (let i = 0; i < 64; i++) {
      const p = this.board[i]
      if (!p) continue
      const type = Math.abs(p)
      const color = Math.sign(p)
      score += color * PIECE_VALUES[type]
      const idx = color === 1 ? i : (7 - (i >> 3)) * 8 + (i & 7)
      if (type === PAWN) score += color * PST_PAWN[idx] * 0.5
      else if (type === KNIGHT) score += color * PST_KNIGHT[idx] * 0.3
      else if (type === KING) score += color * PST_KING[idx] * 0.3
    }
    return score * this.turn
  }

  /** Alpha-beta search */
  alphaBeta(depth: number, initialAlpha: number, beta: number): number {
    if (depth === 0) return this.evaluate()
    const moves = this.legalMoves()
    if (moves.length === 0) return this.isInCheck() ? -20000 + this.ply : 0

    // MVV-LVA move ordering
    moves.sort(
      (a, b) =>
        (this.board[b.to] ? PIECE_VALUES[Math.abs(this.board[b.to])] : 0) -
        (this.board[a.to] ? PIECE_VALUES[Math.abs(this.board[a.to])] : 0),
    )

    let alpha = initialAlpha
    for (const m of moves) {
      const undo = this.makeMove(m)
      const score = -this.alphaBeta(depth - 1, -beta, -alpha)
      this.undoMove(undo)
      if (score >= beta) return beta
      if (score > alpha) alpha = score
    }
    return alpha
  }

  /** Find best move at given depth */
  bestMove(depth: number): Move | null {
    const moves = this.legalMoves()
    if (moves.length === 0) return null

    // Order captures first
    moves.sort(
      (a, b) => (this.board[b.to] ? 1 : 0) - (this.board[a.to] ? 1 : 0),
    )

    let best = moves[0]
    let bestScore = Number.NEGATIVE_INFINITY

    for (const m of moves) {
      const undo = this.makeMove(m)
      const score = -this.alphaBeta(
        depth - 1,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
      )
      this.undoMove(undo)
      if (score > bestScore || (score === bestScore && Math.random() < 0.25)) {
        bestScore = score
        best = m
      }
    }
    return best
  }

  /** Find legal move matching from/to squares */
  findLegalMove(from: Square, to: Square): Move | null {
    for (const m of this.legalMoves()) {
      if (m.from === from && m.to === to) return m
    }
    return null
  }
}
