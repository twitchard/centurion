export type ArrowEntry = {
  readonly by: 1 | 2
  readonly notation: string
  readonly turn: number
}

export type SinglePlayerModel = {
  readonly arrowHistory: readonly ArrowEntry[]
  readonly arrowInput: string
  readonly inputError: string | null
  readonly turn: number
  readonly activePlayer: 1 | 2
}

export const STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export function initSinglePlayerModel(): SinglePlayerModel {
  return {
    arrowHistory: [],
    arrowInput: '',
    inputError: null,
    turn: 1,
    activePlayer: 1,
  }
}
