import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { Key } from 'chessground/types'
import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import {
  type InteractiveBoardSnapshot,
  chessgroundDests,
  commandTextForSquares,
} from '../../core/match/interactive-position'

export class CommandBoard {
  private readonly api: Api
  private snapshot: InteractiveBoardSnapshot | null = null

  constructor(
    container: HTMLElement,
    private readonly onMove: (text: string) => void,
  ) {
    this.api = Chessground(container, {
      coordinates: true,
      viewOnly: true,
      draggable: { enabled: false },
      selectable: { enabled: false },
      highlight: { lastMove: false, check: true },
      animation: { enabled: true, duration: 150 },
      drawable: { enabled: false },
    })
  }

  sync(snapshot: InteractiveBoardSnapshot | null, enabled: boolean): void {
    this.snapshot = snapshot
    if (snapshot === null || !enabled) {
      this.api.set({
        viewOnly: true,
        draggable: { enabled: false },
        selectable: { enabled: false },
      })
      return
    }

    const position = Chess.fromSetup(parseFen(snapshot.fen).unwrap()).unwrap()
    this.api.set({
      fen: snapshot.fen,
      orientation: snapshot.orientation,
      turnColor: snapshot.turnColor,
      check: position.isCheck(),
      viewOnly: false,
      draggable: { enabled: true, showGhost: true },
      selectable: { enabled: true },
      movable: {
        color: snapshot.movableColor,
        dests: chessgroundDests(position),
        showDests: true,
        events: {
          after: (orig, dest) => {
            this.handleMove(orig, dest)
          },
        },
      },
    })
  }

  private handleMove(orig: Key, dest: Key): void {
    const snapshot = this.snapshot
    if (snapshot === null) {
      return
    }
    const position = Chess.fromSetup(parseFen(snapshot.fen).unwrap()).unwrap()
    const text = commandTextForSquares(position, orig, dest)
    if (text !== null) {
      this.onMove(text)
    }
    this.api.set({
      fen: snapshot.fen,
      turnColor: snapshot.turnColor,
    })
  }

  redraw(): void {
    this.api.redrawAll()
  }

  destroy(): void {
    this.api.destroy()
  }
}
