import { type CloudTemplate, prepareTemplate } from './pdollar'

export type GestureName = 'arrow' | 'circle' | 'scribble'

interface Point {
  readonly x: number
  readonly y: number
}

/**
 * Templates for the three marks a drawing can mean. Arrows are stored
 * at many headings because $P keeps orientation. Circles include closed,
 * slightly open, and two-stroke loops. Scribbles are crosses, zigzags,
 * and back-and-forth fills.
 */
export function gestureTemplates(): readonly CloudTemplate[] {
  const templates: CloudTemplate[] = []
  // Headings every 15 degrees. $P keeps orientation, and a line's
  // bounding box changes with its angle, so coarse steps miss diagonals.
  for (let step = 0; step < 24; step++) {
    const angle = (step / 24) * Math.PI * 2
    templates.push(prepareTemplate('arrow', [rotate(line(0, 0, 4, 0), angle)]))
    templates.push(
      prepareTemplate('arrow', [
        rotate(line(0, 0, 4, 0), angle),
        rotate(chevron(4, 0), angle),
      ]),
    )
    templates.push(prepareTemplate('arrow', [rotate(hookedLine(), angle)]))
  }
  templates.push(prepareTemplate('circle', [circle(0, 0, 2, 0, Math.PI * 2)]))
  templates.push(
    prepareTemplate('circle', [circle(0, 0, 2, 0.2, Math.PI * 1.7)]),
  )
  templates.push(
    prepareTemplate('circle', [circle(0, 0, 2, 0.4, Math.PI * 2.15)]),
  )
  templates.push(
    prepareTemplate('circle', [
      circle(0, 0, 2, 0, Math.PI),
      circle(0, 0, 2, Math.PI, Math.PI * 2),
    ]),
  )
  templates.push(
    prepareTemplate('circle', [ellipse(0, 0, 2.2, 1.6, 0, Math.PI * 2)]),
  )
  templates.push(
    prepareTemplate('scribble', [line(0, 0, 3, 3), line(0, 3, 3, 0)]),
  )
  templates.push(
    prepareTemplate('scribble', [line(0, 1.5, 3, 1.5), line(1.5, 0, 1.5, 3)]),
  )
  templates.push(prepareTemplate('scribble', [zigzag()]))
  templates.push(prepareTemplate('scribble', [hatch()]))
  return templates
}

export const GESTURE_TEMPLATES: readonly CloudTemplate[] = gestureTemplates()

function line(x0: number, y0: number, x1: number, y1: number): Point[] {
  const points: Point[] = []
  const steps = 16
  for (let step = 0; step <= steps; step++) {
    const t = step / steps
    points.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t })
  }
  return points
}

function chevron(tipX: number, tipY: number): Point[] {
  return [
    { x: tipX - 0.7, y: tipY + 0.45 },
    { x: tipX, y: tipY },
    { x: tipX - 0.7, y: tipY - 0.45 },
  ]
}

function hookedLine(): Point[] {
  const shaft = line(0, 0, 4, 0)
  return [...shaft, { x: 3.45, y: 0.4 }, { x: 3.35, y: -0.15 }]
}

function circle(
  cx: number,
  cy: number,
  radius: number,
  start: number,
  end: number,
): Point[] {
  const points: Point[] = []
  const steps = 24
  for (let step = 0; step <= steps; step++) {
    const angle = start + ((end - start) * step) / steps
    points.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    })
  }
  return points
}

function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  start: number,
  end: number,
): Point[] {
  const points: Point[] = []
  const steps = 24
  for (let step = 0; step <= steps; step++) {
    const angle = start + ((end - start) * step) / steps
    points.push({
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
    })
  }
  return points
}

function zigzag(): Point[] {
  return [
    { x: 0, y: 0 },
    { x: 0.7, y: 1.2 },
    { x: 0.2, y: 1.5 },
    { x: 1.4, y: 2.4 },
    { x: 0.8, y: 2.2 },
    { x: 1.8, y: 3.2 },
    { x: 1.1, y: 2.7 },
    { x: 2.2, y: 3.6 },
  ]
}

function hatch(): Point[] {
  return [
    { x: 0, y: 0.2 },
    { x: 2, y: 0.4 },
    { x: 0.2, y: 0.8 },
    { x: 1.8, y: 1.1 },
    { x: 0.1, y: 1.5 },
    { x: 2.1, y: 1.7 },
    { x: 0.4, y: 2.1 },
    { x: 1.7, y: 2.3 },
  ]
}

function rotate(points: readonly Point[], angle: number): Point[] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return points.map((point) => ({
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  }))
}
