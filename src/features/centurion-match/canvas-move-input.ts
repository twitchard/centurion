import {
  type SquareClickResult,
  handleSquareClick,
} from '../../core/match/interactive-position'
import type { MatchGame, PlayerId } from '../../core/match/model'
import type { ArrowCoordinate } from '../../core/superposition/types'
import type { SuperpositionRenderer } from '../superposition-lab/render-superposition'

export class CanvasMoveInput {
  private enabled = false
  private game: MatchGame | null = null
  private viewer: PlayerId = 1
  private selected: ArrowCoordinate | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: SuperpositionRenderer,
    private readonly onMove: (text: string) => void,
    private readonly onSelectionChange: () => void,
  ) {
    this.canvas.addEventListener('click', this.onCanvasClick)
  }

  sync(enabled: boolean, game: MatchGame | null, viewer: PlayerId): void {
    this.enabled = enabled
    this.game = game
    this.viewer = viewer
    if (!enabled) {
      this.selected = null
    }
  }

  selectionHighlight(): ArrowCoordinate | undefined {
    return this.selected ?? undefined
  }

  destroy(): void {
    this.canvas.removeEventListener('click', this.onCanvasClick)
  }

  private readonly onCanvasClick = (event: MouseEvent): void => {
    if (!this.enabled || this.game === null) {
      return
    }
    const square = this.renderer.squareAtClientPoint(
      event.clientX,
      event.clientY,
    )
    if (square === null) {
      return
    }
    const result: SquareClickResult = handleSquareClick(
      this.selected,
      square,
      this.game,
      this.viewer,
    )
    this.selected = result.selected
    if (result.command !== null) {
      this.onMove(result.command)
    }
    this.onSelectionChange()
  }
}
