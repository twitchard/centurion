/**
 * Faithful $P point-cloud recognizer.
 *
 * Vatavu, Anthony, and Wobbrock, "Gestures as Point Clouds: A $P
 * Recognizer for User Interface Prototypes", ICMI 2012, using the
 * authors' published pseudocode (resample within a stroke, scale with
 * shape preserved, translate to the origin, then Greedy-Cloud-Match
 * with ε = 0.50). Stroke order and direction are not part of the match.
 * https://depts.washington.edu/acelab/proj/dollar/pdollar.pdf
 */

export interface CloudPoint {
  readonly x: number
  readonly y: number
  readonly strokeId: number
}

export interface CloudTemplate {
  readonly name: string
  readonly points: readonly CloudPoint[]
}

/** Sampling resolution from the published pseudocode. */
export const PDOLLAR_POINT_COUNT = 32

const EPSILON = 0.5

interface MutablePoint {
  x: number
  y: number
  strokeId: number
}

export function normalizeCloud(
  points: readonly CloudPoint[],
  count = PDOLLAR_POINT_COUNT,
): CloudPoint[] {
  const resampled = resample(points.map(clonePoint), count)
  const scaled = scale(resampled)
  return translateToOrigin(scaled)
}

export interface CloudMatch {
  readonly name: string
  readonly score: number
}

/**
 * Nearest template. Score is in [0, 1], 1 a perfect cloud match,
 * using the paper's `(2 - distance) / 2` normalization.
 */
export function pdollarRecognize(
  points: readonly CloudPoint[],
  templates: readonly CloudTemplate[],
): CloudMatch | null {
  if (points.length < 2 || templates.length === 0) {
    return null
  }
  const candidate = normalizeCloud(points)
  if (candidate.length !== PDOLLAR_POINT_COUNT) {
    return null
  }
  let bestName = templates[0]?.name ?? ''
  let bestDistance = Number.POSITIVE_INFINITY
  for (const template of templates) {
    const distance = greedyCloudMatch(candidate, template.points)
    if (distance < bestDistance) {
      bestDistance = distance
      bestName = template.name
    }
  }
  if (!Number.isFinite(bestDistance)) {
    return null
  }
  return {
    name: bestName,
    score: Math.max((2 - bestDistance) / 2, 0),
  }
}

export function prepareTemplate(
  name: string,
  strokes: readonly (readonly { readonly x: number; readonly y: number }[])[],
): CloudTemplate {
  const points: CloudPoint[] = []
  for (let strokeId = 0; strokeId < strokes.length; strokeId++) {
    const stroke = strokes[strokeId] ?? []
    for (const point of stroke) {
      points.push({ x: point.x, y: point.y, strokeId })
    }
  }
  return { name, points: normalizeCloud(points) }
}

function greedyCloudMatch(
  points: readonly CloudPoint[],
  template: readonly CloudPoint[],
): number {
  const count = points.length
  const step = Math.max(1, Math.floor(count ** (1 - EPSILON)))
  let min = Number.POSITIVE_INFINITY
  for (let start = 0; start < count; start += step) {
    const forward = cloudDistance(points, template, start)
    const reverse = cloudDistance(template, points, start)
    min = Math.min(min, forward, reverse)
  }
  return min
}

function cloudDistance(
  points: readonly CloudPoint[],
  template: readonly CloudPoint[],
  start: number,
): number {
  const count = points.length
  const matched = Array.from({ length: count }, () => false)
  let sum = 0
  let index = start
  do {
    let best = Number.POSITIVE_INFINITY
    let matchedIndex = -1
    const point = points[index]
    if (point === undefined) {
      break
    }
    for (let candidate = 0; candidate < count; candidate++) {
      if (matched[candidate]) {
        continue
      }
      const other = template[candidate]
      if (other === undefined) {
        continue
      }
      const distance = Math.hypot(point.x - other.x, point.y - other.y)
      if (distance < best) {
        best = distance
        matchedIndex = candidate
      }
    }
    if (matchedIndex < 0) {
      break
    }
    matched[matchedIndex] = true
    const weight = 1 - ((index - start + count) % count) / count
    sum += weight * best
    index = (index + 1) % count
  } while (index !== start)
  return sum
}

function resample(points: MutablePoint[], count: number): MutablePoint[] {
  if (points.length === 0) {
    return []
  }
  const length = pathLength(points)
  if (length < 1e-8 || count < 2) {
    return points.slice(0, count)
  }
  const interval = length / (count - 1)
  const source = points.map(clonePoint)
  const sampled: MutablePoint[] = [clonePoint(source[0]!)]
  let accumulated = 0
  for (
    let index = 1;
    index < source.length && sampled.length < count;
    index++
  ) {
    const previous = source[index - 1]
    const current = source[index]
    if (
      previous === undefined ||
      current === undefined ||
      previous.strokeId !== current.strokeId
    ) {
      continue
    }
    const span = Math.hypot(current.x - previous.x, current.y - previous.y)
    if (span < 1e-9) {
      continue
    }
    if (accumulated + span >= interval) {
      const t = (interval - accumulated) / span
      const inserted: MutablePoint = {
        x: previous.x + t * (current.x - previous.x),
        y: previous.y + t * (current.y - previous.y),
        strokeId: current.strokeId,
      }
      sampled.push(inserted)
      source.splice(index, 0, inserted)
      accumulated = 0
    } else {
      accumulated += span
    }
  }
  const last = source[source.length - 1]
  if (sampled.length === count - 1 && last !== undefined) {
    sampled.push(clonePoint(last))
  }
  while (sampled.length < count) {
    const pad = sampled[sampled.length - 1]
    if (pad === undefined) {
      break
    }
    sampled.push(clonePoint(pad))
  }
  return sampled.slice(0, count)
}

function scale(points: readonly MutablePoint[]): MutablePoint[] {
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
  const size = Math.max(maxX - minX, maxY - minY)
  if (!Number.isFinite(size) || size < 1e-8) {
    return points.map(clonePoint)
  }
  return points.map((point) => ({
    x: (point.x - minX) / size,
    y: (point.y - minY) / size,
    strokeId: point.strokeId,
  }))
}

function translateToOrigin(points: readonly MutablePoint[]): CloudPoint[] {
  let cx = 0
  let cy = 0
  for (const point of points) {
    cx += point.x
    cy += point.y
  }
  const count = points.length || 1
  cx /= count
  cy /= count
  return points.map((point) => ({
    x: point.x - cx,
    y: point.y - cy,
    strokeId: point.strokeId,
  }))
}

function pathLength(points: readonly MutablePoint[]): number {
  let length = 0
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]
    const current = points[index]
    if (
      previous === undefined ||
      current === undefined ||
      previous.strokeId !== current.strokeId
    ) {
      continue
    }
    length += Math.hypot(current.x - previous.x, current.y - previous.y)
  }
  return length
}

function clonePoint(
  point: CloudPoint | MutablePoint | undefined,
): MutablePoint {
  return {
    x: point?.x ?? 0,
    y: point?.y ?? 0,
    strokeId: point?.strokeId ?? 0,
  }
}
