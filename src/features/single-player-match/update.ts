import { parseArrowList } from '../../core/superposition/parse-arrow-list'
import { type UpdateResult, assertNever } from '../../core/update'
import type { ArrowEntry, SinglePlayerModel } from './model'

export type SinglePlayerMsg =
  | { readonly tag: 'arrow-input-updated'; readonly value: string }
  | { readonly tag: 'arrow-submit-requested' }

export function updateSinglePlayer(
  model: SinglePlayerModel,
  msg: SinglePlayerMsg,
): UpdateResult<SinglePlayerModel, never> {
  switch (msg.tag) {
    case 'arrow-input-updated':
      return [{ ...model, arrowInput: msg.value, inputError: null }, []]

    case 'arrow-submit-requested': {
      const input = model.arrowInput.trim()
      if (input.length === 0) {
        return [{ ...model, inputError: 'Enter an arrow like "e2->e4"' }, []]
      }
      const result = parseArrowList(input)
      if (result.tag === 'invalid') {
        return [
          {
            ...model,
            inputError: result.diagnostics[0] ?? 'Invalid arrow notation',
          },
          [],
        ]
      }
      const entry: ArrowEntry = {
        by: model.activePlayer,
        notation: input,
        turn: model.turn,
      }
      const nextPlayer: 1 | 2 = model.activePlayer === 1 ? 2 : 1
      const nextTurn = nextPlayer === 1 ? model.turn + 1 : model.turn
      return [
        {
          ...model,
          arrowHistory: [...model.arrowHistory, entry],
          arrowInput: '',
          inputError: null,
          activePlayer: nextPlayer,
          turn: nextTurn,
        },
        [],
      ]
    }

    default:
      return assertNever(msg)
  }
}
