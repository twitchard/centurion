import type { Arrow, BoardCoord, PlayerNumber } from '../state/types'

export class OverlayRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private squareSize = 0
  private boardWidth = 0

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

  render(
    arrows: Arrow[],
    currentPlayer: PlayerNumber,
    selectedSquare: BoardCoord | null,
  ): void {
    const ctx = this.ctx
    const sq = this.squareSize
    ctx.clearRect(0, 0, this.boardWidth, this.boardWidth)

    // Draw arrows
    for (const arrow of arrows) {
      const alpha = Math.min(0.7, 0.3 + arrow.stack * 0.15)
      const color =
        arrow.player === currentPlayer
          ? `rgba(0,120,0,${alpha})`
          : `rgba(180,60,0,${alpha})`
      const lineWidth = Math.max(sq * 0.18, 8) * (arrow.stack > 1 ? 1.3 : 1)
      this.drawArrow(arrow.fc, arrow.fr, arrow.tc, arrow.tr, color, lineWidth)
    }

    // Selection dot
    if (selectedSquare) {
      ctx.fillStyle = 'rgba(20,85,30,0.5)'
      ctx.beginPath()
      ctx.arc(
        selectedSquare.col * sq + sq / 2,
        (7 - selectedSquare.row) * sq + sq / 2,
        sq * 0.2,
        0,
        Math.PI * 2,
      )
      ctx.fill()
    }
  }

  private drawArrow(
    fc: number,
    fr: number,
    tc: number,
    tr: number,
    color: string,
    width: number,
  ): void {
    const ctx = this.ctx
    const sq = this.squareSize
    const x1 = fc * sq + sq / 2
    const y1 = (7 - fr) * sq + sq / 2
    const x2 = tc * sq + sq / 2
    const y2 = (7 - tr) * sq + sq / 2
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const ux = dx / len
    const uy = dy / len
    const headLen = width * 1.8
    const headWidth = width * 0.9

    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'

    // Shaft
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2 - ux * headLen, y2 - uy * headLen)
    ctx.stroke()

    // Head
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(
      x2 - ux * headLen - uy * headWidth,
      y2 - uy * headLen + ux * headWidth,
    )
    ctx.lineTo(
      x2 - ux * headLen + uy * headWidth,
      y2 - uy * headLen - ux * headWidth,
    )
    ctx.closePath()
    ctx.fill()
  }
}
