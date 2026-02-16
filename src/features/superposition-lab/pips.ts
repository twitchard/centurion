export interface PipPosition {
  x: number
  y: number
}

const LAYOUTS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.28, 0.28],
    [0.72, 0.72],
  ],
  3: [
    [0.28, 0.22],
    [0.72, 0.22],
    [0.5, 0.72],
  ],
  4: [
    [0.27, 0.27],
    [0.73, 0.27],
    [0.27, 0.73],
    [0.73, 0.73],
  ],
  5: [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.5, 0.5],
    [0.25, 0.75],
    [0.75, 0.75],
  ],
  6: [
    [0.25, 0.22],
    [0.75, 0.22],
    [0.25, 0.5],
    [0.75, 0.5],
    [0.25, 0.78],
    [0.75, 0.78],
  ],
  7: [
    [0.25, 0.2],
    [0.75, 0.2],
    [0.5, 0.4],
    [0.25, 0.58],
    [0.75, 0.58],
    [0.35, 0.8],
    [0.65, 0.8],
  ],
  8: [
    [0.22, 0.2],
    [0.5, 0.2],
    [0.78, 0.2],
    [0.22, 0.5],
    [0.78, 0.5],
    [0.22, 0.8],
    [0.5, 0.8],
    [0.78, 0.8],
  ],
  9: [
    [0.22, 0.2],
    [0.5, 0.2],
    [0.78, 0.2],
    [0.22, 0.5],
    [0.5, 0.5],
    [0.78, 0.5],
    [0.22, 0.8],
    [0.5, 0.8],
    [0.78, 0.8],
  ],
}

export function pipPositions(n: number): PipPosition[] {
  if (n <= 0) {
    return []
  }
  if (n <= 9) {
    const layout = LAYOUTS[n]
    if (layout !== undefined) {
      return layout.map(([x, y]) => ({ x, y }))
    }
  }

  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const points: PipPosition[] = []
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols)
    const col = i % cols
    points.push({ x: (col + 0.5) / cols, y: (row + 0.5) / rows })
  }
  return points
}
