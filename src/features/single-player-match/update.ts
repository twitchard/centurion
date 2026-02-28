import { parseArrowList } from '../../core/superposition/parse-arrow-list'
import { type UpdateResult, assertNever } from '../../core/update'
import type { ArrowEntry, SinglePlayerModel } from './model'

export type SinglePlayerMsg =
  | { readonly tag: 'arrow-input-updated'; readonly value: string }
  | { readonly tag: 'arrow-submit-requested' }
  | { readonly tag: 'computer-arrow-received'; readonly notation: string }

export type SinglePlayerCmd = { readonly tag: 'generate-computer-arrow' }

export function updateSinglePlayer(
  model: SinglePlayerModel,
  msg: SinglePlayerMsg,
): UpdateResult<SinglePlayerModel, SinglePlayerCmd> {
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
      const playerEntry: ArrowEntry = {
        by: 'player',
        notation: input,
        turn: model.turn,
      }
      return [
        {
          ...model,
          arrowHistory: [...model.arrowHistory, playerEntry],
          arrowInput: '',
          inputError: null,
          awaitingComputer: true,
        },
        [{ tag: 'generate-computer-arrow' }],
      ]
    }

    case 'computer-arrow-received': {
      const computerEntry: ArrowEntry = {
        by: 'computer',
        notation: msg.notation,
        turn: model.turn,
      }
      return [
        {
          ...model,
          arrowHistory: [...model.arrowHistory, computerEntry],
          awaitingComputer: false,
          turn: model.turn + 1,
        },
        [],
      ]
    }

    default:
      return assertNever(msg)
  }
}
