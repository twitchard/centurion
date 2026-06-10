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

const WHITE_CHIP_BG = '#efe9dd'
const WHITE_CHIP_FG = '#1c1a17'
const WHITE_CHIP_BORDER = 'rgba(0, 0, 0, 0.45)'
const BLACK_CHIP_BG = '#13110e'
const BLACK_CHIP_FG = '#efe9dd'
const BLACK_CHIP_BORDER = 'rgba(255, 255, 255, 0.35)'
const OVERFLOW_CHIP_BG = 'rgba(150, 150, 150, 0.22)'
const OVERFLOW_CHIP_FG = '#cccccc'
const OVERFLOW_CHIP_BORDER = 'rgba(255, 255, 255, 0.18)'

const CHIP_FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

/** Most piece-type chips a square will show before collapsing into "+N". */
const MAX_CHIPS = 6

const PIECE_LETTERS: Record<FenPieceSymbol, string> = {
  P: 'P',
  N: 'N',
  B: 'B',
  R: 'R',
  Q: 'Q',
  K: 'K',
  p: 'P',
  n: 'N',
  b: 'B',
  r: 'R',
  q: 'Q',
  k: 'K',
}

function isWhitePiece(piece: FenPieceSymbol): boolean {
  return piece === piece.toUpperCase()
}

function formatCount(count: number): string {
  return count > 999 ? '999+' : `${count}`
}

interface Chip {
  readonly text: string
  readonly bg: string
  readonly fg: string
  readonly border: string
}

/**
 * Turn one square's piece distribution into display chips: per piece
 * type a letter plus how many games hold that piece here, ordered by
 * count. Counts are omitted when only a single position is shown.
 */
function squareChips(
  stacks: readonly PieceStack[],
  positionCount: number,
): Chip[] {
  const sorted = [...stacks].sort((left, right) => right.count - left.count)
  const overflowing = sorted.length > MAX_CHIPS
  const visible = overflowing ? sorted.slice(0, MAX_CHIPS - 1) : sorted

  const chips: Chip[] = visible.map((stack) => {
    const letter = PIECE_LETTERS[stack.piece]
    const white = isWhitePiece(stack.piece)
    return {
      text:
        positionCount === 1 ? letter : `${letter} ${formatCount(stack.count)}`,
      bg: white ? WHITE_CHIP_BG : BLACK_CHIP_BG,
      fg: white ? WHITE_CHIP_FG : BLACK_CHIP_FG,
      border: white ? WHITE_CHIP_BORDER : BLACK_CHIP_BORDER,
    }
  })

  if (overflowing) {
    chips.push({
      text: `+${sorted.length - visible.length}`,
      bg: OVERFLOW_CHIP_BG,
      fg: OVERFLOW_CHIP_FG,
      border: OVERFLOW_CHIP_BORDER,
    })
  }
  return chips
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
    // Back the canvas at device resolution so text stays crisp on
    // high-DPI (phone) screens; drawing code keeps using CSS pixels.
    const ratio =
      typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1
    this.canvas.width = Math.round(evenSize * ratio)
    this.canvas.height = Math.round(evenSize * ratio)
    this.canvas.style.width = `${evenSize}px`
    this.canvas.style.height = `${evenSize}px`
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
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

  private drawPieceLayers(model: SuperpositionRenderModel): void {
    const square = this.squareSize
    for (const layer of model.squareLayers) {
      const col = layer.square & 7
      const row = layer.square >> 3
      this.drawSquareHistogram(
        squareChips(layer.stacks, model.positionCount),
        col * square,
        (7 - row) * square,
      )
    }
  }

  /**
   * Lay the square's chips out in a small grid: a single column for one
   * or two entries, two columns beyond that.
   */
  private drawSquareHistogram(
    chips: readonly Chip[],
    squareX: number,
    squareY: number,
  ): void {
    if (chips.length === 0) {
      return
    }

    const square = this.squareSize
    const pad = square * 0.08
    const gap = square * 0.045
    const cols = chips.length <= 2 ? 1 : 2
    const rows = Math.ceil(chips.length / cols)
    const cellWidth = (square - 2 * pad - (cols - 1) * gap) / cols
    const cellHeight = (square - 2 * pad - (rows - 1) * gap) / rows

    for (let index = 0; index < chips.length; index++) {
      const chip = chips[index]
      if (chip === undefined) {
        continue
      }
      const col = index % cols
      const row = Math.floor(index / cols)
      // Center a final odd chip that has its row to itself.
      const lonelyLastRow =
        cols === 2 && row === rows - 1 && chips.length % 2 === 1
      const x = lonelyLastRow
        ? squareX + pad + (cellWidth + gap) / 2
        : squareX + pad + col * (cellWidth + gap)
      const y = squareY + pad + row * (cellHeight + gap)
      this.drawChip(chip, x, y, cellWidth, cellHeight)
    }
  }

  private drawChip(
    chip: Chip,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const ctx = this.context

    ctx.fillStyle = chip.bg
    ctx.fillRect(x, y, width, height)
    ctx.strokeStyle = chip.border
    ctx.lineWidth = Math.max(1, height * 0.05)
    ctx.strokeRect(x, y, width, height)

    const fontSize = Math.max(
      8,
      Math.min(height * 0.68, (width * 0.9) / (chip.text.length * 0.62)),
    )
    ctx.fillStyle = chip.fg
    ctx.font = `700 ${fontSize}px ${CHIP_FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(chip.text, x + width / 2, y + height / 2 + fontSize * 0.05)
  }

  private drawArrows(arrows: readonly ArrowSegment[]): void {
    // Arrows are permanent, so old ones pile up; fade them with age and
    // keep the newest prominent. Stacked duplicates overdraw and
    // naturally read as stronger.
    const count = arrows.length
    for (let index = 0; index < count; index++) {
      const arrow = arrows[index]
      if (arrow === undefined) {
        continue
      }
      const recency = count <= 1 ? 1 : index / (count - 1)
      const alpha = 0.16 + 0.56 * recency * recency
      this.drawArrow(arrow, alpha)
    }
  }

  private arrowColor(owner: 1 | 2 | undefined, alpha: number): string {
    if (owner === 1) {
      return `rgba(120, 200, 80, ${alpha})`
    }
    if (owner === 2) {
      return `rgba(228, 90, 84, ${alpha})`
    }
    return `rgba(90, 185, 255, ${alpha})`
  }

  private drawArrow(arrow: ArrowSegment, alpha: number): void {
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
    const width = Math.max(square * 0.06, 4)
    const headLength = width * 2.4
    const headWidth = width * 1.4

    const color = this.arrowColor(arrow.owner, alpha)
    ctx.strokeStyle = color
    ctx.fillStyle = color
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

    const count = arrow.count ?? 1
    if (count >= 2) {
      this.drawArrowCountBadge(
        arrow,
        (fromX + toX) / 2,
        (fromY + toY) / 2,
        count,
        alpha,
      )
    }
  }

  private drawArrowCountBadge(
    arrow: ArrowSegment,
    x: number,
    y: number,
    count: number,
    alpha: number,
  ): void {
    const ctx = this.context
    const square = this.squareSize
    const radius = Math.max(9, square * 0.17)
    const badgeAlpha = Math.min(1, alpha + 0.3)

    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(15, 14, 12, ${badgeAlpha})`
    ctx.fill()
    ctx.lineWidth = Math.max(1.5, radius * 0.16)
    ctx.strokeStyle = this.arrowColor(arrow.owner, badgeAlpha)
    ctx.stroke()

    ctx.fillStyle = `rgba(245, 245, 245, ${badgeAlpha})`
    ctx.font = `700 ${radius * 1.05}px ${CHIP_FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${count > 99 ? '99+' : count}`, x, y + radius * 0.05)
  }
}
