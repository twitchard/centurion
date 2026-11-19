import type { InkMark } from '../../core/ink/gesture'
import { type BoardPoint, distance } from '../../core/ink/gesture'

/**
 * Finger and mouse ink on top of the superposition board. Strokes stay
 * local until the pointer lifts; the session then classifies them.
 */
export class InkDrawLayer {
  private enabled = true
  private drawing = false
  private pointerId: number | null = null
  private draft: BoardPoint[] = []
  private marks: readonly InkMark[] = []
  private boardWidth = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onStroke: (points: readonly BoardPoint[]) => void,
  ) {
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointermove', this.onMove)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('pointercancel', this.onUp)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.canvas.style.cursor = enabled ? 'crosshair' : 'default'
    if (!enabled) {
      this.drawing = false
      this.pointerId = null
      this.draft = []
      this.paint()
    }
  }

  resize(size: number): void {
    const evenSize = Math.max(160, Math.floor(size / 8) * 8)
    this.boardWidth = evenSize
    const ratio =
      typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1
    this.canvas.width = Math.round(evenSize * ratio)
    this.canvas.height = Math.round(evenSize * ratio)
    this.canvas.style.width = `${evenSize}px`
    this.canvas.style.height = `${evenSize}px`
    const context = this.canvas.getContext('2d')
    context?.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  render(marks: readonly InkMark[]): void {
    this.marks = marks
    this.paint()
  }

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown)
    this.canvas.removeEventListener('pointermove', this.onMove)
    this.canvas.removeEventListener('pointerup', this.onUp)
    this.canvas.removeEventListener('pointercancel', this.onUp)
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (!this.enabled || event.button !== 0) {
      return
    }
    const point = this.boardPoint(event)
    if (point === null) {
      return
    }
    this.drawing = true
    this.pointerId = event.pointerId
    this.draft = [point]
    this.canvas.setPointerCapture?.(event.pointerId)
    if (event.cancelable) {
      event.preventDefault()
    }
    this.paint()
  }

  private readonly onMove = (event: PointerEvent): void => {
    if (!this.drawing || event.pointerId !== this.pointerId) {
      return
    }
    const point = this.boardPoint(event)
    if (point === null) {
      return
    }
    const last = this.draft[this.draft.length - 1]
    if (last !== undefined && distance(last, point) < 0.04) {
      return
    }
    this.draft.push(point)
    if (event.cancelable) {
      event.preventDefault()
    }
    this.paint()
  }

  private readonly onUp = (event: PointerEvent): void => {
    if (!this.drawing || event.pointerId !== this.pointerId) {
      return
    }
    const point = this.boardPoint(event)
    if (point !== null) {
      this.draft.push(point)
    }
    const stroke = this.draft
    this.drawing = false
    this.pointerId = null
    this.draft = []
    this.paint()
    if (stroke.length >= 2) {
      this.onStroke(stroke)
    }
  }

  private boardPoint(event: PointerEvent): BoardPoint | null {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return null
    }
    const x = ((event.clientX - rect.left) / rect.width) * 8
    const y = ((rect.bottom - event.clientY) / rect.height) * 8
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null
    }
    return {
      x: Math.min(8, Math.max(0, x)),
      y: Math.min(8, Math.max(0, y)),
    }
  }

  private paint(): void {
    const context = this.canvas.getContext('2d')
    if (context === null || this.boardWidth === 0) {
      return
    }
    context.clearRect(0, 0, this.boardWidth, this.boardWidth)
    for (const mark of this.marks) {
      this.paintMark(context, mark)
    }
    if (this.draft.length > 1) {
      this.stroke(context, this.draft, '#1d4ed8', 3, false)
    }
  }

  private paintMark(context: CanvasRenderingContext2D, mark: InkMark): void {
    switch (mark.tag) {
      case 'arrow':
        this.stroke(context, [mark.tail, mark.head], '#1d4ed8', 3, true)
        return
      case 'circle':
        this.paintCircle(context, mark.center, mark.radius)
        return
      case 'scribble':
        this.paintScribble(context, mark.points)
        return
    }
  }

  private paintScribble(
    context: CanvasRenderingContext2D,
    points: readonly BoardPoint[],
  ): void {
    if (points.length === 0) {
      return
    }
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const point of points) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
    const scale = this.boardWidth / 8
    const cx = ((minX + maxX) / 2) * scale
    const cy = (8 - (minY + maxY) / 2) * scale
    const rx = Math.max(0.35, (maxX - minX) / 2 + 0.25) * scale
    const ry = Math.max(0.35, (maxY - minY) / 2 + 0.25) * scale
    context.beginPath()
    context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    context.fillStyle = 'rgba(185, 28, 28, 0.18)'
    context.fill()
    context.strokeStyle = '#b91c1c'
    context.lineWidth = 2
    context.stroke()
  }

  private paintCircle(
    context: CanvasRenderingContext2D,
    center: BoardPoint,
    radius: number,
  ): void {
    const scale = this.boardWidth / 8
    context.beginPath()
    context.arc(
      center.x * scale,
      (8 - center.y) * scale,
      radius * scale,
      0,
      Math.PI * 2,
    )
    context.strokeStyle = '#1d4ed8'
    context.lineWidth = 3
    context.stroke()
  }

  private stroke(
    context: CanvasRenderingContext2D,
    points: readonly BoardPoint[],
    color: string,
    width: number,
    arrow: boolean,
  ): void {
    if (points.length < 2) {
      return
    }
    const scale = this.boardWidth / 8
    const toX = (point: BoardPoint) => point.x * scale
    const toY = (point: BoardPoint) => (8 - point.y) * scale
    context.beginPath()
    context.moveTo(toX(points[0]!), toY(points[0]!))
    for (let index = 1; index < points.length; index++) {
      context.lineTo(toX(points[index]!), toY(points[index]!))
    }
    context.strokeStyle = color
    context.lineWidth = width
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.stroke()
    if (!arrow) {
      return
    }
    const tail = points[points.length - 2]!
    const head = points[points.length - 1]!
    const angle = Math.atan2(toY(head) - toY(tail), toX(head) - toX(tail))
    const hx = toX(head)
    const hy = toY(head)
    const headLen = Math.max(10, this.boardWidth * 0.035)
    context.beginPath()
    context.moveTo(hx, hy)
    context.lineTo(
      hx - headLen * Math.cos(angle - 0.45),
      hy - headLen * Math.sin(angle - 0.45),
    )
    context.lineTo(
      hx - headLen * Math.cos(angle + 0.45),
      hy - headLen * Math.sin(angle + 0.45),
    )
    context.closePath()
    context.fillStyle = color
    context.fill()
  }
}
