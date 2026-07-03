import { validateCommandText } from '../../core/command/text'
import {
  type UpdateResult,
  assertNever,
  noCmd,
  withCmd,
} from '../../core/update'
import type { CommandCompileResult } from '../../ports/command-compiler'
import {
  type CommandLabModel,
  buildCommandLabModel,
  initCommandLabModel,
} from './model'

export type CommandLabMsg =
  | { readonly tag: 'command-input-updated'; readonly value: string }
  | { readonly tag: 'endpoint-input-updated'; readonly value: string }
  | { readonly tag: 'fen-input-updated'; readonly value: string }
  | { readonly tag: 'compile-requested' }
  | {
      readonly tag: 'compile-finished'
      readonly command: string
      readonly result: CommandCompileResult
    }
  | { readonly tag: 'reset-fixtures-requested' }

export type CommandLabCmd = {
  readonly tag: 'compile-command'
  readonly endpoint: string
  readonly command: string
}

export function updateCommandLab(
  model: CommandLabModel,
  msg: CommandLabMsg,
): UpdateResult<CommandLabModel, CommandLabCmd> {
  switch (msg.tag) {
    case 'command-input-updated':
      return noCmd(
        buildCommandLabModel(
          msg.value,
          model.endpointInput,
          model.fenInput,
          model.compile,
        ),
      )

    case 'endpoint-input-updated':
      return noCmd(
        buildCommandLabModel(
          model.commandInput,
          msg.value,
          model.fenInput,
          model.compile,
        ),
      )

    case 'fen-input-updated':
      return noCmd(
        buildCommandLabModel(
          model.commandInput,
          model.endpointInput,
          msg.value,
          model.compile,
        ),
      )

    case 'compile-requested': {
      if (model.compile.tag === 'compiling') {
        return noCmd(model)
      }
      const validated = validateCommandText(model.commandInput)
      if (validated.tag === 'invalid') {
        return noCmd(
          buildCommandLabModel(
            model.commandInput,
            model.endpointInput,
            model.fenInput,
            {
              tag: 'failed',
              command: model.commandInput,
              message: validated.diagnostics.join(' '),
            },
          ),
        )
      }
      return withCmd(
        buildCommandLabModel(
          model.commandInput,
          model.endpointInput,
          model.fenInput,
          { tag: 'compiling', command: validated.value },
        ),
        {
          tag: 'compile-command',
          endpoint: model.endpointInput.trim(),
          command: validated.value,
        },
      )
    }

    case 'compile-finished': {
      if (
        model.compile.tag !== 'compiling' ||
        model.compile.command !== msg.command
      ) {
        // A stale response (input changed, lab re-entered): ignore it.
        return noCmd(model)
      }
      const compile =
        msg.result.tag === 'compiled'
          ? {
              tag: 'compiled' as const,
              command: msg.command,
              predicate: msg.result.predicate,
            }
          : {
              tag: 'failed' as const,
              command: msg.command,
              message: msg.result.message,
            }
      return noCmd(
        buildCommandLabModel(
          model.commandInput,
          model.endpointInput,
          model.fenInput,
          compile,
        ),
      )
    }

    case 'reset-fixtures-requested':
      return noCmd(initCommandLabModel())

    default:
      return assertNever(msg)
  }
}
