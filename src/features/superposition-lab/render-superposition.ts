import type {
  ArrowCoordinate,
  ArrowSegment,
  FenPieceSymbol,
  PieceMoveOverlay,
  PieceStack,
  SuperpositionRenderModel,
} from '../../core/superposition/types'

const BOARD_DARK = '#2a2017'
const BOARD_LIGHT = '#3a2d20'
const GRID_LINE = 'rgba(236, 217, 160, 0.06)'
const LABEL_COLOR = '#a38c61'

const WHITE_CHIP_BG = '#efe9dd'
const WHITE_CHIP_FG = '#1c1a17'
const WHITE_CHIP_BORDER = 'rgba(0, 0, 0, 0.45)'
const BLACK_CHIP_BG = '#13110e'
const BLACK_CHIP_FG = '#efe9dd'
const BLACK_CHIP_BORDER = 'rgba(255, 255, 255, 0.35)'

// Black pieces are darker than the board itself, so their light rim is
// what carries the silhouette; keep it strong or the two sides blur
// together at small tile sizes.
const WHITE_GLYPH_FILL = '#f3ecdd'
const WHITE_GLYPH_OUTLINE = 'rgba(18, 14, 9, 0.9)'
const BLACK_GLYPH_FILL = '#16130f'
const BLACK_GLYPH_OUTLINE = 'rgba(243, 236, 221, 0.9)'

const CHIP_FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const GLYPH_FONT_FAMILY =
  '"DejaVu Sans", "Segoe UI Symbol", "Noto Sans Symbols 2", "Apple Symbols", sans-serif'

/** How a square's piece distribution is depicted. */
export type PieceDisplayMode = 'pieces' | 'letters'

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

// Both colors use the filled glyph forms; the outline forms render too
// thin on a canvas, so color comes from fill/stroke instead.
const PIECE_GLYPHS: Record<FenPieceSymbol, string> = {
  P: '♟',
  N: '♞',
  B: '♝',
  R: '♜',
  Q: '♛',
  K: '♚',
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
}

function isWhitePiece(piece: FenPieceSymbol): boolean {
  return piece === piece.toUpperCase()
}

function formatCount(count: number): string {
  return count > 999 ? '999+' : `${count}`
}

// Per-player accents, matching the arrows and the side-panel copy:
// player 1 is gold, player 2 crimson. Count badges and chip borders
// pick these up when the board knows which player the viewer is.
const PLAYER_COUNT_FILL: Record<1 | 2, string> = {
  1: '#ffd97d',
  2: '#f59c8d',
}
const PLAYER_CHIP_BORDER: Record<1 | 2, string> = {
  1: 'rgba(224, 185, 79, 0.85)',
  2: 'rgba(214, 92, 76, 0.95)',
}
const NEUTRAL_COUNT_FILL = '#ffd97d'

interface Chip {
  readonly text: string
  readonly bg: string
  readonly fg: string
  readonly border: string
  readonly whitePiece: boolean
}

/**
 * Turn one square's piece distribution into display chips: per piece
 * type a letter plus how many games hold that piece here, ordered by
 * count. Counts are omitted when only a single position is shown. A
 * square holds at most 12 distinct piece types, and the grid layout
 * fits them all, so nothing is ever collapsed away.
 */
function squareChips(
  stacks: readonly PieceStack[],
  positionCount: number,
): Chip[] {
  const sorted = [...stacks].sort((left, right) => right.count - left.count)
  return sorted.map((stack) => {
    const letter = PIECE_LETTERS[stack.piece]
    const white = isWhitePiece(stack.piece)
    return {
      text:
        positionCount === 1 ? letter : `${letter} ${formatCount(stack.count)}`,
      bg: white ? WHITE_CHIP_BG : BLACK_CHIP_BG,
      fg: white ? WHITE_CHIP_FG : BLACK_CHIP_FG,
      border: white ? WHITE_CHIP_BORDER : BLACK_CHIP_BORDER,
      whitePiece: white,
    }
  })
}

export class SuperpositionRenderer {
  displayMode: PieceDisplayMode = 'pieces'

  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private boardWidth = 0
  private squareSize = 0
  private viewerPlayer: 1 | 2 | undefined

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

  render(
    model: SuperpositionRenderModel,
    overlays: readonly PieceMoveOverlay[] = [],
  ): void {
    if (this.boardWidth === 0 || this.squareSize === 0) {
      return
    }

    this.viewerPlayer = model.viewerPlayer
    this.drawBoard()
    if (model.highlight !== undefined) {
      this.drawHighlight(model.highlight.col, model.highlight.row)
    }
    this.drawPieceLayers(model)
    this.drawArrows(model.arrows)
    this.drawMoveOverlays(overlays)
  }

  /** Map a screen point to the visual board square under it, if any. */
  squareAtClientPoint(
    clientX: number,
    clientY: number,
  ): ArrowCoordinate | null {
    if (this.boardWidth === 0 || this.squareSize === 0) {
      return null
    }
    const rect = this.canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    if (x < 0 || y < 0 || x >= this.boardWidth || y >= this.boardWidth) {
      return null
    }
    const col = Math.floor(x / this.squareSize)
    const row = 7 - Math.floor(y / this.squareSize)
    if (col < 0 || col > 7 || row < 0 || row > 7) {
      return null
    }
    return { col, row }
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
    ctx.fillStyle = 'rgba(224, 185, 79, 0.22)'
    ctx.fillRect(x, y, square, square)
    ctx.strokeStyle = 'rgba(224, 185, 79, 0.85)'
    ctx.lineWidth = Math.max(2, square * 0.04)
    ctx.strokeRect(x + 1, y + 1, square - 2, square - 2)
  }

  private drawPieceLayers(model: SuperpositionRenderModel): void {
    const square = this.squareSize
    for (const layer of model.squareLayers) {
      const col = layer.square & 7
      const row = layer.square >> 3
      const x = col * square
      const y = (7 - row) * square
      if (this.displayMode === 'pieces') {
        this.drawSquarePieces(layer.stacks, model.positionCount, x, y)
      } else {
        this.drawSquareHistogram(
          squareChips(layer.stacks, model.positionCount),
          x,
          y,
        )
      }
    }
  }

  /**
   * Lay the square's chips out in a small grid: a single column for one
   * or two entries, two columns up to six, three beyond that (a square
   * holds at most 12 distinct piece types).
   */
  /** White glyphs are the viewer's pieces; black the opponent's. */
  private pieceOwner(whitePiece: boolean): 1 | 2 | undefined {
    if (this.viewerPlayer === undefined) {
      return undefined
    }
    if (whitePiece) {
      return this.viewerPlayer
    }
    return this.viewerPlayer === 1 ? 2 : 1
  }

  private countFill(whitePiece: boolean): string {
    const owner = this.pieceOwner(whitePiece)
    return owner === undefined ? NEUTRAL_COUNT_FILL : PLAYER_COUNT_FILL[owner]
  }

  private chipBorder(chip: Chip): string {
    const owner = this.pieceOwner(chip.whitePiece)
    return owner === undefined ? chip.border : PLAYER_CHIP_BORDER[owner]
  }

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
    const cols = chips.length <= 2 ? 1 : chips.length <= 6 ? 2 : 3
    const rows = Math.ceil(chips.length / cols)
    const cellWidth = (square - 2 * pad - (cols - 1) * gap) / cols
    const cellHeight = (square - 2 * pad - (rows - 1) * gap) / rows
    const lastRowCount = chips.length - (rows - 1) * cols

    for (let index = 0; index < chips.length; index++) {
      const chip = chips[index]
      if (chip === undefined) {
        continue
      }
      const col = index % cols
      const row = Math.floor(index / cols)
      // Center a partially filled final row.
      const lastRowShift =
        row === rows - 1 ? ((cols - lastRowCount) * (cellWidth + gap)) / 2 : 0
      const x = squareX + pad + col * (cellWidth + gap) + lastRowShift
      const y = squareY + pad + row * (cellHeight + gap)
      this.drawChip(chip, x, y, cellWidth, cellHeight)
    }
  }

  /**
   * Piece mode: tile the square into a near-square grid, one cell per
   * piece type, and draw the piece glyph in each cell. Multiplicity
   * shows as a fanned stack of glyphs plus a count in the cell corner.
   */
  private drawSquarePieces(
    stacks: readonly PieceStack[],
    positionCount: number,
    squareX: number,
    squareY: number,
  ): void {
    if (stacks.length === 0) {
      return
    }

    const sorted = [...stacks].sort((left, right) => right.count - left.count)
    const square = this.squareSize
    const pad = square * 0.03
    const cols = Math.ceil(Math.sqrt(sorted.length))
    const rows = Math.ceil(sorted.length / cols)
    const cellWidth = (square - 2 * pad) / cols
    const cellHeight = (square - 2 * pad) / rows
    const lastRowCount = sorted.length - (rows - 1) * cols

    for (let index = 0; index < sorted.length; index++) {
      const stack = sorted[index]
      if (stack === undefined) {
        continue
      }
      const col = index % cols
      const row = Math.floor(index / cols)
      // Center a partially filled final row.
      const lastRowShift =
        row === rows - 1 ? ((cols - lastRowCount) * cellWidth) / 2 : 0
      this.drawGlyphStack(
        stack,
        positionCount,
        squareX + pad + col * cellWidth + lastRowShift,
        squareY + pad + row * cellHeight,
        cellWidth,
        cellHeight,
      )
    }
  }

  private drawGlyphStack(
    stack: PieceStack,
    positionCount: number,
    cellX: number,
    cellY: number,
    cellWidth: number,
    cellHeight: number,
  ): void {
    const ctx = this.context
    const white = isWhitePiece(stack.piece)
    const glyph = PIECE_GLYPHS[stack.piece]
    const size = Math.min(cellWidth, cellHeight)
    // Fan duplicates diagonally behind the front glyph so a pile of ten
    // pawns visibly reads as a pile, capped so it stays in its cell.
    const depth = Math.min(stack.count, 4)
    const step = size * 0.07
    const fan = (depth - 1) * step
    const fontSize = Math.max(8, (size - fan) * 0.82)
    const frontX = cellX + cellWidth / 2 - fan / 2
    const frontY = cellY + cellHeight / 2 + fan / 2 + fontSize * 0.06

    ctx.font = `${fontSize}px ${GLYPH_FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = Math.max(1.2, fontSize * 0.06)
    ctx.lineJoin = 'round'
    ctx.fillStyle = white ? WHITE_GLYPH_FILL : BLACK_GLYPH_FILL
    ctx.strokeStyle = white ? WHITE_GLYPH_OUTLINE : BLACK_GLYPH_OUTLINE

    for (let layer = depth - 1; layer >= 0; layer--) {
      const x = frontX + layer * step
      const y = frontY - layer * step
      ctx.globalAlpha = layer === 0 ? 1 : 0.55 - layer * 0.08
      ctx.strokeText(glyph, x, y)
      ctx.fillText(glyph, x, y)
    }
    ctx.globalAlpha = 1

    if (positionCount > 1 && stack.count > 1) {
      const countSize = Math.max(8, size * 0.3)
      const countX = cellX + cellWidth - countSize * 0.2
      const countY = cellY + cellHeight - countSize * 0.45
      ctx.font = `700 ${countSize}px ${CHIP_FONT_FAMILY}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = Math.max(2, countSize * 0.22)
      ctx.strokeStyle = 'rgba(12, 11, 9, 0.85)'
      ctx.strokeText(formatCount(stack.count), countX, countY)
      ctx.fillStyle = this.countFill(white)
      ctx.fillText(formatCount(stack.count), countX, countY)
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
    ctx.strokeStyle = this.chipBorder(chip)
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

  /**
   * Pieces mid-transition during turn resolution. Arrow-driven moves
   * slide with a gold glow and a small scale pulse for emphasis; engine
   * moves fade out at their origin and fade back in at the destination.
   */
  private drawMoveOverlays(overlays: readonly PieceMoveOverlay[]): void {
    const ctx = this.context
    const square = this.squareSize
    for (const overlay of overlays) {
      const progress = Math.min(1, Math.max(0, overlay.progress))
      const fromX = overlay.from.col * square + square / 2
      const fromY = (7 - overlay.from.row) * square + square / 2
      const toX = overlay.to.col * square + square / 2
      const toY = (7 - overlay.to.row) * square + square / 2

      let x: number
      let y: number
      let alpha: number
      let scale: number
      if (overlay.kind === 'slide') {
        const eased =
          progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - (-2 * progress + 2) ** 3 / 2
        x = fromX + (toX - fromX) * eased
        y = fromY + (toY - fromY) * eased
        alpha = 1
        scale = 1 + 0.22 * Math.sin(Math.PI * progress)
      } else {
        const leaving = progress < 0.5
        x = leaving ? fromX : toX
        y = leaving ? fromY : toY
        alpha = leaving ? 1 - progress * 2 : progress * 2 - 1
        scale = 1
      }

      const white = overlay.piece === overlay.piece.toUpperCase()
      const glyph = PIECE_GLYPHS[overlay.piece]
      const fontSize = square * 0.78 * scale

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.font = `${fontSize}px ${GLYPH_FONT_FAMILY}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = Math.max(1.2, fontSize * 0.06)
      ctx.lineJoin = 'round'
      if (overlay.kind === 'slide') {
        ctx.shadowColor = 'rgba(224, 185, 79, 0.9)'
        ctx.shadowBlur = square * 0.3
      }
      ctx.fillStyle = white ? WHITE_GLYPH_FILL : BLACK_GLYPH_FILL
      ctx.strokeStyle = white ? WHITE_GLYPH_OUTLINE : BLACK_GLYPH_OUTLINE
      ctx.strokeText(glyph, x, y)
      ctx.fillText(glyph, x, y)
      ctx.restore()
    }
  }

  private drawArrows(arrows: readonly ArrowSegment[]): void {
    // Older arrows fade as their decay weight drops; keep the newest prominent. Stacked duplicates overdraw and
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

  // Legion gold for player 1, imperial crimson for player 2, matching
  // the arrow-history entry colors in the side panel.
  private arrowColor(owner: 1 | 2 | undefined, alpha: number): string {
    if (owner === 1) {
      return `rgba(224, 185, 79, ${alpha})`
    }
    if (owner === 2) {
      return `rgba(199, 62, 50, ${alpha})`
    }
    return `rgba(143, 174, 87, ${alpha})`
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
