import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { Key } from 'chessground/types'

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
    })
  }

  setPosition(fen: string, lastMove?: readonly [string, string]): void {
    const turnColor = fen.split(' ')[1] === 'b' ? 'black' : 'white'
    const update: Parameters<Api['set']>[0] = { fen, turnColor }
    if (lastMove !== undefined) {
      update.lastMove = [lastMove[0] as Key, lastMove[1] as Key]
    }
    this.api.set(update)
  }

  redraw(): void {
    this.api.redrawAll()
  }

  destroy(): void {
    this.api.destroy()
  }
}
