import type {
  ArrowSegment,
  FenPieceSymbol,
  PieceStack,
  SuperpositionRenderModel,
} from '../../core/superposition/types'
import { drawPiece } from '../../engine/pieces'
import { pipPositions } from '../../render/pips'

const BOARD_DARK = '#2d2a26'
const BOARD_LIGHT = '#38342f'
const GRID_LINE = 'rgba(255, 255, 255, 0.05)'
const LABEL_COLOR = '#a8a8a8'

interface PieceStyle {
  readonly typeIndex: number
  readonly isWhite: boolean
}

const PIECE_STYLES: Record<FenPieceSymbol, PieceStyle> = {
  P: { typeIndex: 1, isWhite: true },
  N: { typeIndex: 2, isWhite: true },
  B: { typeIndex: 3, isWhite: true },
  R: { typeIndex: 4, isWhite: true },
  Q: { typeIndex: 5, isWhite: true },
  K: { typeIndex: 6, isWhite: true },
  p: { typeIndex: 1, isWhite: false },
  n: { typeIndex: 2, isWhite: false },
  b: { typeIndex: 3, isWhite: false },
  r: { typeIndex: 4, isWhite: false },
  q: { typeIndex: 5, isWhite: false },
  k: { typeIndex: 6, isWhite: false },
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
    this.drawPieceLayers(model)
    this.drawArrows(model.arrows)
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
    const ctx = this.context
    const square = this.squareSize
    const pips = pipPositions(stacks.length)
    const padding = square * 0.08
    const innerSize = square - padding * 2

    for (let index = 0; index < stacks.length; index++) {
      const stack = stacks[index]
      const pip = pips[index]
      if (stack === undefined || pip === undefined) {
        continue
      }

      const style = PIECE_STYLES[stack.piece]
      const groupSize = stacks.length
      const pieceScale =
        groupSize <= 1
          ? 0.88
          : groupSize <= 4
            ? 0.44
            : groupSize <= 6
              ? 0.35
              : 0.3

      const pieceSize = square * pieceScale
      const pieceX = squareX + padding + pip.x * innerSize - pieceSize / 2
      const pieceY = squareY + padding + pip.y * innerSize - pieceSize / 2
      const opacity = Math.min(1, Math.max(0.12, stack.count / totalPositions))

      ctx.save()
      ctx.globalAlpha = opacity
      drawPiece(ctx, style.typeIndex, pieceX, pieceY, pieceSize, style.isWhite)
      ctx.restore()

      if (stack.count > 1 && groupSize <= 5) {
        this.drawCountBadge(stack.count, pieceX, pieceY, pieceSize, opacity)
      }
    }
  }

  private drawCountBadge(
    count: number,
    pieceX: number,
    pieceY: number,
    pieceSize: number,
    opacity: number,
  ): void {
    const ctx = this.context
    const badgeSize = Math.max(8, pieceSize * 0.32)
    const badgeX = pieceX + pieceSize - badgeSize * 0.3
    const badgeY = pieceY + pieceSize - badgeSize * 0.3

    ctx.save()
    ctx.globalAlpha = Math.min(1, opacity + 0.25)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
    ctx.beginPath()
    ctx.arc(badgeX, badgeY, badgeSize * 0.58, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${badgeSize * 0.72}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(count > 99 ? '99+' : `${count}`, badgeX, badgeY)
    ctx.restore()
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
