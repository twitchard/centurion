import { describe, expect, it } from 'vitest'
import { SuperpositionRenderer } from './render-superposition'

class TestCanvas {
  width = 0
  height = 0
  readonly style: { width?: string; height?: string } = {}
  private readonly context = {
    setTransform: () => {
      return
    },
  }

  getContext(kind: string): CanvasRenderingContext2D | null {
    if (kind !== '2d') {
      return null
    }
    return this.context as unknown as CanvasRenderingContext2D
  }

  getBoundingClientRect(): {
    left: number
    top: number
    width: number
    height: number
  } {
    const width = Number.parseFloat(this.style.width ?? '') || 0
    const height = Number.parseFloat(this.style.height ?? '') || width
    return { left: 0, top: 0, width, height }
  }
}

describe('SuperpositionRenderer.squareAtClientPoint', () => {
  it('maps clicks proportionally when the canvas is scaled in CSS', () => {
    const canvas = new TestCanvas() as unknown as HTMLCanvasElement
    const renderer = new SuperpositionRenderer(canvas)
    renderer.resize(400)
    canvas.style.width = '320px'
    canvas.style.height = '320px'

    const centerOf = (square: string): { x: number; y: number } => {
      const col = square.charCodeAt(0) - 'a'.charCodeAt(0)
      const rowFromTop = 8 - Number(square[1])
      return {
        x: ((col + 0.5) / 8) * 320,
        y: ((rowFromTop + 0.5) / 8) * 320,
      }
    }

    const e2 = centerOf('e2')
    const e4 = centerOf('e4')
    expect(renderer.squareAtClientPoint(e2.x, e2.y)).toEqual({ col: 4, row: 1 })
    expect(renderer.squareAtClientPoint(e4.x, e4.y)).toEqual({ col: 4, row: 3 })
  })
})
