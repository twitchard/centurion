import type {
  ArrowSegment,
  FenPieceSymbol,
  PieceStack,
  SuperpositionRenderModel,
} from '../../core/superposition/types'

const BOARD_DARK = '#2d2a26'
const BOARD_LIGHT = '#38342f'
const GRID_LINE = 'rgba(255, 255, 255, 0.05)'
const LABEL_COLOR = '#a8a8a8'

interface PieceGlyphStyle {
  readonly glyph: string
  readonly isWhite: boolean
}

const PIECE_GLYPHS: Record<FenPieceSymbol, PieceGlyphStyle> = {
  P: { glyph: '♙', isWhite: true },
  N: { glyph: '♘', isWhite: true },
  B: { glyph: '♗', isWhite: true },
  R: { glyph: '♖', isWhite: true },
  Q: { glyph: '♕', isWhite: true },
  K: { glyph: '♔', isWhite: true },
  p: { glyph: '♟', isWhite: false },
  n: { glyph: '♞', isWhite: false },
  b: { glyph: '♝', isWhite: false },
  r: { glyph: '♜', isWhite: false },
  q: { glyph: '♛', isWhite: false },
  k: { glyph: '♚', isWhite: false },
}

export class SuperpositionRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private boardWidth = 0
  private squareSize = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const context = canvas.getContext('2d')
    if (context === null) {
      throw new Error('2D canvas context is not available')
    }
    this.context = context
  }

  resize(size: number): void {
    const evenSize = Math.max(160, Math.floor(size / 8) * 8)
    this.boardWidth = evenSize
    this.squareSize = evenSize / 8
    this.canvas.width = evenSize
    this.canvas.height = evenSize
    this.canvas.style.width = `${evenSize}px`
    this.canvas.style.height = `${evenSize}px`
  }

  render(model: SuperpositionRenderModel): void {
    if (this.boardWidth === 0 || this.squareSize === 0) {
      return
    }

    this.drawBoard()
    if (model.highlight !== undefined) {
      this.drawHighlight(model.highlight.col, model.highlight.row)
    }
    this.drawPieceLayers(model)
    this.drawArrows(model.arrows)
  }

  private drawHighlight(col: number, row: number): void {
    const ctx = this.context
    const square = this.squareSize
    const x = col * square
    const y = (7 - row) * square
    ctx.fillStyle = 'rgba(122, 199, 255, 0.22)'
    ctx.fillRect(x, y, square, square)
    ctx.strokeStyle = 'rgba(122, 199, 255, 0.85)'
    ctx.lineWidth = Math.max(2, square * 0.04)
    ctx.strokeRect(x + 1, y + 1, square - 2, square - 2)
  }

  private drawBoard(): void {
    const ctx = this.context
    const square = this.squareSize

    ctx.clearRect(0, 0, this.boardWidth, this.boardWidth)
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const isLight = (row + col) % 2 === 0
        ctx.fillStyle = isLight ? BOARD_LIGHT : BOARD_DARK
        ctx.fillRect(col * square, (7 - row) * square, square, square)
      }
    }

    ctx.strokeStyle = GRID_LINE
    ctx.lineWidth = 1
    for (let line = 1; line < 8; line++) {
      const offset = line * square
      ctx.beginPath()
      ctx.moveTo(offset, 0)
      ctx.lineTo(offset, this.boardWidth)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, offset)
      ctx.lineTo(this.boardWidth, offset)
      ctx.stroke()
    }

    ctx.fillStyle = LABEL_COLOR
    ctx.font = `bold ${Math.max(9, square * 0.15)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    for (let col = 0; col < 8; col++) {
      ctx.fillText(
        String.fromCharCode(97 + col),
        col * square + square - 5,
        8 * square - 3,
      )
    }
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    for (let row = 0; row < 8; row++) {
      ctx.fillText(`${row + 1}`, 3, (7 - row) * square + 3)
    }
  }

  private drawPieceLayers(model: SuperpositionRenderModel): void {
    const ctx = this.context
    const square = this.squareSize
    const totalPositions = Math.max(1, model.positionCount)

    for (const layer of model.squareLayers) {
      const col = layer.square & 7
      const row = layer.square >> 3
      const squareX = col * square
      const squareY = (7 - row) * square
      this.drawStackedPieces(layer.stacks, totalPositions, squareX, squareY)
    }

    ctx.globalAlpha = 1
  }

  private drawStackedPieces(
    stacks: readonly PieceStack[],
    totalPositions: number,
    squareX: number,
    squareY: number,
  ): void {
    if (stacks.length === 0) {
      return
    }

    const ctx = this.context
    const square = this.squareSize
    const centerX = squareX + square / 2
    const centerY = squareY + square / 2
    const pieceTypeCount = stacks.length
    const orbitRadius = this.orbitRadius(pieceTypeCount)
    const pieceSize = this.pieceSize(pieceTypeCount, orbitRadius)

    for (let index = 0; index < pieceTypeCount; index++) {
      const stack = stacks[index]
      if (stack === undefined) {
        continue
      }

      const style = PIECE_GLYPHS[stack.piece]
      const slotAngle = this.slotAngle(index, pieceTypeCount)
      const pieceRotation = slotAngle + Math.PI / 2
      const anchorX = centerX + Math.cos(slotAngle) * orbitRadius
      const anchorY = centerY + Math.sin(slotAngle) * orbitRadius
      const opacity = Math.min(1, Math.max(0.12, stack.count / totalPositions))

      ctx.save()
      ctx.globalAlpha = opacity
      ctx.translate(anchorX, anchorY)
      ctx.rotate(pieceRotation)
      this.drawPieceGlyph(style, pieceSize)
      this.drawCountBadge(stack.count, pieceSize, pieceRotation, opacity)
      ctx.restore()
    }
  }

  private slotAngle(index: number, total: number): number {
    if (total <= 1) {
      return -Math.PI / 2
    }
    return -Math.PI / 2 + (index * Math.PI * 2) / total
  }

  private orbitRadius(pieceTypeCount: number): number {
    const square = this.squareSize
    if (pieceTypeCount <= 1) {
      return 0
    }
    if (pieceTypeCount <= 4) {
      return square * 0.18
    }
    if (pieceTypeCount <= 8) {
      return square * 0.21
    }
    return square * 0.24
  }

  private pieceSize(pieceTypeCount: number, orbitRadius: number): number {
    const square = this.squareSize
    if (pieceTypeCount <= 1) {
      return square * 0.72
    }

    const margin = square * 0.08
    const maxOrbit = square / 2 - margin
    const arcLength = (Math.PI * 2 * orbitRadius) / pieceTypeCount
    const radialSpan = Math.max(0, (maxOrbit - orbitRadius) * 2)
    const maxSize = Math.min(square * 0.4, arcLength * 0.82, radialSpan * 0.92)
    return Math.max(square * 0.1, maxSize)
  }

  private drawCountBadge(
    count: number,
    pieceSize: number,
    pieceRotation: number,
    opacity: number,
  ): void {
    const ctx = this.context
    const badgeSize = Math.max(9, pieceSize * 0.34)
    const badgeY = -pieceSize * 0.6

    ctx.save()
    ctx.translate(0, badgeY)
    ctx.rotate(-pieceRotation)
    ctx.globalAlpha = Math.min(1, opacity + 0.25)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
    ctx.beginPath()
    ctx.arc(0, 0, badgeSize * 0.58, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${badgeSize * 0.72}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(count > 99 ? '99+' : `${count}`, 0, 0)
    ctx.restore()
  }

  private drawPieceGlyph(style: PieceGlyphStyle, pieceSize: number): void {
    const ctx = this.context
    const radius = pieceSize / 2

    // Render a token-style base for readability on dark/light squares.
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fillStyle = style.isWhite ? '#f5f5f5' : '#171717'
    ctx.fill()
    ctx.lineWidth = Math.max(1, pieceSize * 0.07)
    ctx.strokeStyle = style.isWhite ? '#2c2c2c' : '#dedede'
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(0, radius * 0.34, radius * 0.42, 0, Math.PI * 2)
    ctx.fillStyle = style.isWhite
      ? 'rgba(0, 0, 0, 0.15)'
      : 'rgba(255, 255, 255, 0.16)'
    ctx.fill()

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 ${Math.max(10, pieceSize * 0.84)}px "DejaVu Sans", "Noto Sans Symbols 2", "Noto Sans Symbols", "Segoe UI Symbol", sans-serif`
    ctx.fillStyle = style.isWhite ? '#171717' : '#f2f2f2'
    ctx.strokeStyle = style.isWhite
      ? 'rgba(255, 255, 255, 0.45)'
      : 'rgba(0, 0, 0, 0.5)'
    ctx.lineWidth = Math.max(1, pieceSize * 0.06)
    ctx.strokeText(style.glyph, 0, pieceSize * 0.03)
    ctx.fillText(style.glyph, 0, pieceSize * 0.03)
  }

  private drawArrows(arrows: readonly ArrowSegment[]): void {
    for (const arrow of arrows) {
      this.drawArrow(arrow)
    }
  }

  private drawArrow(arrow: ArrowSegment): void {
    const ctx = this.context
    const square = this.squareSize
    const fromX = arrow.from.col * square + square / 2
    const fromY = (7 - arrow.from.row) * square + square / 2
    const toX = arrow.to.col * square + square / 2
    const toY = (7 - arrow.to.row) * square + square / 2
    const deltaX = toX - fromX
    const deltaY = toY - fromY
    const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY) || 1
    const unitX = deltaX / length
    const unitY = deltaY / length
    const width = Math.max(square * 0.12, 7)
    const headLength = width * 2
    const headWidth = width * 1.1

    ctx.strokeStyle = 'rgba(90, 185, 255, 0.72)'
    ctx.fillStyle = 'rgba(90, 185, 255, 0.72)'
    ctx.lineWidth = width
    ctx.lineCap = 'round'

    ctx.beginPath()
    ctx.moveTo(fromX, fromY)
    ctx.lineTo(toX - unitX * headLength, toY - unitY * headLength)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(toX, toY)
    ctx.lineTo(
      toX - unitX * headLength - unitY * headWidth,
      toY - unitY * headLength + unitX * headWidth,
    )
    ctx.lineTo(
      toX - unitX * headLength + unitY * headWidth,
      toY - unitY * headLength - unitX * headWidth,
    )
    ctx.closePath()
    ctx.fill()
  }
}
