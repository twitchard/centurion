import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { DrawBrushes, DrawShape } from 'chessground/draw'
import type { Key } from 'chessground/types'
import type { PlayerId } from '../../core/match/model'

/**
 * Brushes matching the superposition board's arrow palette: legion gold
 * for player 1, imperial crimson for player 2, olive when the owner is
 * unknown (matches recorded before owners were tracked). The four
 * standard brushes are required by the type; they keep their defaults.
 */
const ARROW_BRUSHES: DrawBrushes = {
  green: { key: 'g', color: '#15781B', opacity: 1, lineWidth: 10 },
  red: { key: 'r', color: '#882020', opacity: 1, lineWidth: 10 },
  blue: { key: 'b', color: '#003088', opacity: 1, lineWidth: 10 },
  yellow: { key: 'y', color: '#e68f00', opacity: 1, lineWidth: 10 },
  p1Arrow: { key: 'p1a', color: '#e0b94f', opacity: 0.85, lineWidth: 10 },
  p2Arrow: { key: 'p2a', color: '#c73e32', opacity: 0.85, lineWidth: 10 },
  unknownArrow: { key: 'una', color: '#8fae57', opacity: 0.85, lineWidth: 10 },
}

function brushFor(owner: PlayerId | undefined): string {
  if (owner === 1) {
    return 'p1Arrow'
  }
  if (owner === 2) {
    return 'p2Arrow'
  }
  return 'unknownArrow'
}

export interface ReplayArrow {
  readonly owner: PlayerId | undefined
}

export class ReplayBoard {
  private readonly api: Api

  constructor(container: HTMLElement) {
    this.api = Chessground(container, {
      viewOnly: true,
      coordinates: true,
      movable: { free: false },
      draggable: { enabled: false },
      selectable: { enabled: false },
      highlight: { lastMove: true },
      animation: { enabled: true, duration: 200 },
      drawable: { enabled: false, visible: true, brushes: ARROW_BRUSHES },
    })
  }

  /**
   * Show a position; when the last move was pulled by a board arrow,
   * `arrow` overlays a player-colored arrow along the move.
   */
  setPosition(
    fen: string,
    lastMove?: readonly [string, string],
    arrow?: ReplayArrow,
  ): void {
    const turnColor = fen.split(' ')[1] === 'b' ? 'black' : 'white'
    const update: Parameters<Api['set']>[0] = { fen, turnColor }
    if (lastMove !== undefined) {
      update.lastMove = [lastMove[0] as Key, lastMove[1] as Key]
    }
    this.api.set(update)
    const shapes: DrawShape[] = []
    if (arrow !== undefined && lastMove !== undefined) {
      shapes.push({
        orig: lastMove[0] as Key,
        dest: lastMove[1] as Key,
        brush: brushFor(arrow.owner),
      })
    }
    this.api.setAutoShapes(shapes)
  }

  redraw(): void {
    this.api.redrawAll()
  }

  destroy(): void {
    this.api.destroy()
  }
}
