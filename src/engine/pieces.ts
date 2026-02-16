// @ts-nocheck
import { PIECE_NAMES } from './constants'

type PieceRenderer = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  isWhite: boolean,
) => void

const renderers: Record<string, PieceRenderer> = {
  P(ctx, x, y, s, isW) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s / 45, s / 45)
    ctx.beginPath()
    ctx.arc(22.5, 12, 5.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(14, 26)
    ctx.quadraticCurveTo(22.5, 18, 31, 26)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(10, 36)
    ctx.lineTo(14, 26)
    ctx.lineTo(31, 26)
    ctx.lineTo(35, 36)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(8, 40)
    ctx.lineTo(10, 36)
    ctx.lineTo(35, 36)
    ctx.lineTo(37, 40)
    ctx.closePath()
    ctx.fill()
    if (!isW) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(22.5, 12, 5.5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(10, 36)
      ctx.lineTo(14, 26)
      ctx.lineTo(31, 26)
      ctx.lineTo(35, 36)
      ctx.closePath()
      ctx.stroke()
    }
    ctx.restore()
  },

  N(ctx, x, y, s, isW) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s / 45, s / 45)
    ctx.beginPath()
    ctx.moveTo(22, 10)
    ctx.lineTo(28, 8)
    ctx.lineTo(32, 14)
    ctx.lineTo(28, 18)
    ctx.lineTo(34, 24)
    ctx.lineTo(36, 34)
    ctx.lineTo(36, 38)
    ctx.lineTo(9, 38)
    ctx.lineTo(9, 34)
    ctx.lineTo(12, 26)
    ctx.lineTo(10, 20)
    ctx.lineTo(14, 14)
    ctx.lineTo(18, 12)
    ctx.closePath()
    ctx.fill()
    // Eye
    ctx.fillStyle = isW ? '#b58863' : '#f0d9b5'
    ctx.beginPath()
    ctx.arc(18, 16, 1.2, 0, Math.PI * 2)
    ctx.fill()
    // Base
    ctx.fillStyle = isW ? '#fff' : '#000'
    ctx.beginPath()
    ctx.moveTo(7, 42)
    ctx.lineTo(9, 38)
    ctx.lineTo(36, 38)
    ctx.lineTo(38, 42)
    ctx.closePath()
    ctx.fill()
    if (!isW) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(22, 10)
      ctx.lineTo(28, 8)
      ctx.lineTo(32, 14)
      ctx.lineTo(28, 18)
      ctx.lineTo(34, 24)
      ctx.lineTo(36, 34)
      ctx.lineTo(36, 38)
      ctx.lineTo(9, 38)
      ctx.lineTo(9, 34)
      ctx.lineTo(12, 26)
      ctx.lineTo(10, 20)
      ctx.lineTo(14, 14)
      ctx.lineTo(18, 12)
      ctx.closePath()
      ctx.stroke()
    }
    ctx.restore()
  },

  B(ctx, x, y, s, isW) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s / 45, s / 45)
    ctx.beginPath()
    ctx.arc(22.5, 8, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(15, 32)
    ctx.quadraticCurveTo(22.5, 10, 30, 32)
    ctx.lineTo(30, 35)
    ctx.lineTo(15, 35)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(17.5, 22)
    ctx.lineTo(27.5, 22)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = isW ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.25)'
    ctx.stroke()
    ctx.fillStyle = isW ? '#fff' : '#000'
    ctx.beginPath()
    ctx.moveTo(10, 40)
    ctx.lineTo(14, 35)
    ctx.lineTo(31, 35)
    ctx.lineTo(35, 40)
    ctx.closePath()
    ctx.fill()
    if (!isW) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(15, 32)
      ctx.quadraticCurveTo(22.5, 10, 30, 32)
      ctx.lineTo(30, 35)
      ctx.lineTo(15, 35)
      ctx.closePath()
      ctx.stroke()
    }
    ctx.restore()
  },

  R(ctx, x, y, s, isW) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s / 45, s / 45)
    ctx.beginPath()
    ctx.moveTo(12, 8)
    ctx.lineTo(12, 14)
    ctx.lineTo(16, 14)
    ctx.lineTo(16, 8)
    ctx.lineTo(20, 8)
    ctx.lineTo(20, 14)
    ctx.lineTo(25, 14)
    ctx.lineTo(25, 8)
    ctx.lineTo(29, 8)
    ctx.lineTo(29, 14)
    ctx.lineTo(33, 14)
    ctx.lineTo(33, 8)
    ctx.lineTo(33, 14)
    ctx.lineTo(35, 18)
    ctx.lineTo(35, 34)
    ctx.lineTo(10, 34)
    ctx.lineTo(10, 18)
    ctx.lineTo(12, 14)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(8, 38)
    ctx.lineTo(10, 34)
    ctx.lineTo(35, 34)
    ctx.lineTo(37, 38)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(6, 42)
    ctx.lineTo(8, 38)
    ctx.lineTo(37, 38)
    ctx.lineTo(39, 42)
    ctx.closePath()
    ctx.fill()
    if (!isW) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(12, 8)
      ctx.lineTo(12, 14)
      ctx.lineTo(16, 14)
      ctx.lineTo(16, 8)
      ctx.lineTo(20, 8)
      ctx.lineTo(20, 14)
      ctx.lineTo(25, 14)
      ctx.lineTo(25, 8)
      ctx.lineTo(29, 8)
      ctx.lineTo(29, 14)
      ctx.lineTo(33, 14)
      ctx.lineTo(33, 8)
      ctx.lineTo(33, 14)
      ctx.lineTo(35, 18)
      ctx.lineTo(35, 34)
      ctx.lineTo(10, 34)
      ctx.lineTo(10, 18)
      ctx.lineTo(12, 14)
      ctx.closePath()
      ctx.stroke()
    }
    ctx.restore()
  },

  Q(ctx, x, y, s, isW) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s / 45, s / 45)
    const pts: [number, number][] = [
      [8, 30],
      [12, 10],
      [16, 22],
      [22.5, 6],
      [29, 22],
      [33, 10],
      [37, 30],
    ]
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.lineTo(37, 34)
    ctx.lineTo(8, 34)
    ctx.closePath()
    ctx.fill()
    for (const [px, py] of [
      [12, 10],
      [22.5, 6],
      [33, 10],
    ] as [number, number][]) {
      ctx.beginPath()
      ctx.arc(px, py - 1, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.moveTo(6, 38)
    ctx.lineTo(8, 34)
    ctx.lineTo(37, 34)
    ctx.lineTo(39, 38)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(5, 42)
    ctx.lineTo(6, 38)
    ctx.lineTo(39, 38)
    ctx.lineTo(40, 42)
    ctx.closePath()
    ctx.fill()
    if (!isW) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
      ctx.lineTo(37, 34)
      ctx.lineTo(8, 34)
      ctx.closePath()
      ctx.stroke()
    }
    ctx.restore()
  },

  K(ctx, x, y, s, isW) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s / 45, s / 45)
    ctx.fillRect(20.5, 2, 4, 8)
    ctx.fillRect(17, 4.5, 11, 3)
    ctx.beginPath()
    ctx.moveTo(10, 30)
    ctx.quadraticCurveTo(10, 16, 22.5, 12)
    ctx.quadraticCurveTo(35, 16, 35, 30)
    ctx.lineTo(35, 34)
    ctx.lineTo(10, 34)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(12, 26)
    ctx.lineTo(33, 26)
    ctx.lineWidth = 2
    ctx.strokeStyle = isW ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)'
    ctx.stroke()
    ctx.fillStyle = isW ? '#fff' : '#000'
    ctx.beginPath()
    ctx.moveTo(8, 38)
    ctx.lineTo(10, 34)
    ctx.lineTo(35, 34)
    ctx.lineTo(37, 38)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(6, 42)
    ctx.lineTo(8, 38)
    ctx.lineTo(37, 38)
    ctx.lineTo(39, 42)
    ctx.closePath()
    ctx.fill()
    if (!isW) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(10, 30)
      ctx.quadraticCurveTo(10, 16, 22.5, 12)
      ctx.quadraticCurveTo(35, 16, 35, 30)
      ctx.lineTo(35, 34)
      ctx.lineTo(10, 34)
      ctx.closePath()
      ctx.stroke()
    }
    ctx.restore()
  },
}

export function drawPiece(
  ctx: CanvasRenderingContext2D,
  typeIndex: number,
  x: number,
  y: number,
  size: number,
  isWhite: boolean,
): void {
  ctx.fillStyle = isWhite ? '#fff' : '#000'
  const name = PIECE_NAMES[typeIndex]
  renderers[name]?.(ctx, x, y, size, isWhite)
}
