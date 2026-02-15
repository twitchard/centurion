import type { Game } from '../engine/game'
import { drawPiece } from '../engine/pieces'
import type { BoardCoord, PlayerNumber, ViewMode } from '../state/types'
import { pipPositions } from './pips'

const LIGHT = '#f0d9b5'
const DARK = '#b58863'
const SEL_LIGHT = '#e8e066'
const SEL_DARK = '#baca44'

const NUM_GAMES = 100

interface PieceEntry {
  isWhite: boolean
  type: number
  count: number
}

/** Convert a board square to visual coordinates */
function toVisual(sq: number, flip: boolean): { col: number; row: number } {
  const f = sq & 7
  const r = sq >> 3
  return flip ? { col: f, row: 7 - r } : { col: f, row: r }
}

export class BoardRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  squareSize = 0
  boardWidth = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  resize(size: number): void {
    this.boardWidth = Math.floor(size / 8) * 8
    this.squareSize = this.boardWidth / 8
    this.canvas.width = this.boardWidth
    this.canvas.height = this.boardWidth
    this.canvas.style.width = `${this.boardWidth}px`
    this.canvas.style.height = `${this.boardWidth}px`
  }

  /** Get board coordinates from pixel position */
  pixelToCoord(clientX: number, clientY: number): BoardCoord | null {
    const rect = this.canvas.getBoundingClientRect()
    const scale = this.canvas.width / rect.width
    const px = (clientX - rect.left) * scale
    const py = (clientY - rect.top) * scale
    const col = Math.floor(px / this.squareSize)
    const row = 7 - Math.floor(py / this.squareSize)
    if (col >= 0 && col < 8 && row >= 0 && row < 8) return { col, row }
    return null
  }

  render(
    games: Game[],
    _currentPlayer: PlayerNumber,
    viewPlayer: PlayerNumber,
    selectedSquare: BoardCoord | null,
    viewMode: ViewMode,
  ): void {
    const ctx = this.ctx
    const sq = this.squareSize
    const bw = this.boardWidth
    ctx.clearRect(0, 0, bw, bw)

    // Draw board squares
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const light = (r + c) % 2 === 0
        const isSel = selectedSquare?.col === c && selectedSquare?.row === r
        ctx.fillStyle = isSel
          ? light
            ? SEL_LIGHT
            : SEL_DARK
          : light
            ? LIGHT
            : DARK
        ctx.fillRect(c * sq, (7 - r) * sq, sq, sq)
      }
    }

    // Draw coordinates
    ctx.font = `bold ${Math.max(9, sq * 0.14)}px -apple-system,BlinkMacSystemFont,sans-serif`
    for (let c = 0; c < 8; c++) {
      ctx.fillStyle = c % 2 === 0 ? DARK : LIGHT
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(
        String.fromCharCode(97 + c),
        c * sq + sq - 4,
        7 * sq + sq - 2,
      )
    }
    for (let r = 0; r < 8; r++) {
      ctx.fillStyle = (r + 1) % 2 === 0 ? LIGHT : DARK
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`${r + 1}`, 2, (7 - r) * sq + 2)
    }

    // Collect piece counts per visual square
    const pieceMap: Map<string, number>[] = Array.from(
      { length: 64 },
      () => new Map(),
    )
    let activeCount = 0
    for (const g of games) {
      if (!g.result) activeCount++
    }
    if (activeCount === 0) activeCount = 1

    for (let gi = 0; gi < NUM_GAMES; gi++) {
      const g = games[gi]
      if (g.result) continue

      const isBlackGame = viewPlayer === 1 ? gi >= 50 : gi < 50
      if (viewMode === 'white' && isBlackGame) continue
      if (viewMode === 'black' && !isBlackGame) continue

      const flip = isBlackGame
      for (let s = 0; s < 64; s++) {
        const piece = g.board[s]
        if (!piece) continue
        const v = toVisual(s, flip)
        const idx = v.row * 8 + v.col
        const key = `${piece > 0 ? 'w' : 'b'}${Math.abs(piece)}`
        pieceMap[idx].set(key, (pieceMap[idx].get(key) || 0) + 1)
      }
    }

    const maxGames =
      viewMode === 'all' ? activeCount : Math.ceil(activeCount / 2)

    // Draw pieces with pip layout
    for (let idx = 0; idx < 64; idx++) {
      const map = pieceMap[idx]
      if (map.size === 0) continue

      const col = idx & 7
      const row = idx >> 3
      const sqX = col * sq
      const sqY = (7 - row) * sq

      const entries: PieceEntry[] = []
      for (const [key, count] of map) {
        entries.push({
          isWhite: key[0] === 'w',
          type: Number.parseInt(key[1]),
          count,
        })
      }
      entries.sort((a, b) => b.type - a.type)

      const totalEntries = entries.length
      const pips = pipPositions(totalEntries)
      const padding = sq * 0.08
      const innerSize = sq - padding * 2

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const pip = pips[i]
        const pieceScale =
          totalEntries <= 1
            ? 0.88
            : totalEntries <= 4
              ? 0.42
              : totalEntries <= 6
                ? 0.34
                : 0.28
        const ps = sq * pieceScale
        const px = sqX + padding + pip.x * innerSize - ps / 2
        const py = sqY + padding + pip.y * innerSize - ps / 2

        const opacity = Math.min(1, Math.max(0.15, entry.count / maxGames))
        ctx.save()
        ctx.globalAlpha = opacity
        drawPiece(ctx, entry.type, px, py, ps, entry.isWhite)
        ctx.restore()

        // Count badge
        if (entry.count > 1 && totalEntries <= 4) {
          const badgeSize = Math.max(8, ps * 0.32)
          const bx = px + ps - badgeSize * 0.3
          const by = py + ps - badgeSize * 0.3
          ctx.save()
          ctx.globalAlpha = Math.min(1, opacity + 0.3)
          ctx.fillStyle = 'rgba(0,0,0,0.65)'
          ctx.beginPath()
          ctx.arc(bx, by, badgeSize * 0.55, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.font = `bold ${badgeSize * 0.75}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(entry.count > 99 ? '99+' : `${entry.count}`, bx, by)
          ctx.restore()
        }
      }
    }
  }
}
