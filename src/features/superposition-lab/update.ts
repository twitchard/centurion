import { type UpdateResult, assertNever } from '../../core/update'
import {
  DEFAULT_SUPERPOSITION_ARROW_INPUT,
  DEFAULT_SUPERPOSITION_FEN_INPUT,
  type SuperpositionLabModel,
  buildSuperpositionLabModel,
} from './model'

export type SuperpositionLabMsg =
  | { readonly tag: 'fen-input-updated'; readonly value: string }
  | { readonly tag: 'arrow-input-updated'; readonly value: string }
  | { readonly tag: 'reset-fixtures-requested' }

export function updateSuperpositionLab(
  model: SuperpositionLabModel,
  msg: SuperpositionLabMsg,
): UpdateResult<SuperpositionLabModel, never> {
  switch (msg.tag) {
    case 'fen-input-updated':
      return [buildSuperpositionLabModel(msg.value, model.arrowInput), []]
    case 'arrow-input-updated':
      return [buildSuperpositionLabModel(model.fenInput, msg.value), []]
    case 'reset-fixtures-requested':
      return [
        buildSuperpositionLabModel(
          DEFAULT_SUPERPOSITION_FEN_INPUT,
          DEFAULT_SUPERPOSITION_ARROW_INPUT,
        ),
        [],
      ]
    default:
      return assertNever(msg)
  }
}
