import { matchingMoves } from '../../core/command/evaluate'
import type { CommandPredicate } from '../../core/command/model'
import {
  type CommandLabPosition,
  parseCommandLabPositions,
} from '../../core/command/positions'
import type { ParseResult } from '../../core/parsing/types'

export type CommandCompileState =
  | { readonly tag: 'idle' }
  | { readonly tag: 'compiling'; readonly command: string }
  | {
      readonly tag: 'compiled'
      readonly command: string
      readonly predicate: CommandPredicate
    }
  | {
      readonly tag: 'failed'
      readonly command: string
      readonly message: string
    }

export interface CommandLabModel {
  readonly commandInput: string
  readonly endpointInput: string
  readonly fenInput: string
  readonly fenParse: ParseResult<readonly CommandLabPosition[]>
  readonly compile: CommandCompileState
}

export const DEFAULT_COMMAND_INPUT = 'all knights advance'

export const DEFAULT_COMMAND_LAB_FENS = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
  'rnbqkb1r/pp3ppp/3ppn2/2p5/3PP3/2N5/PPP1BPPP/R1BQK1NR w KQkq - 0 5',
].join('\n')

export function defaultCommandCompilerEndpoint(): string {
  const configured = import.meta.env.VITE_COMMAND_COMPILER_URL?.trim()
  if (configured !== undefined && configured.length > 0) {
    return configured
  }
  return import.meta.env.DEV
    ? 'http://localhost:8787/api/compile'
    : '/api/compile'
}

export function buildCommandLabModel(
  commandInput: string,
  endpointInput: string,
  fenInput: string,
  compile: CommandCompileState,
): CommandLabModel {
  return {
    commandInput,
    endpointInput,
    fenInput,
    fenParse: parseCommandLabPositions(fenInput),
    compile,
  }
}

export function initCommandLabModel(): CommandLabModel {
  return buildCommandLabModel(
    DEFAULT_COMMAND_INPUT,
    defaultCommandCompilerEndpoint(),
    DEFAULT_COMMAND_LAB_FENS,
    { tag: 'idle' },
  )
}

export interface CommandLabPositionMatches {
  readonly fen: string
  readonly sans: readonly string[]
}

/**
 * Matching moves per parsed position for the compiled predicate; empty
 * when nothing is compiled or the FENs do not parse.
 */
export function commandLabMatches(
  model: CommandLabModel,
): readonly CommandLabPositionMatches[] {
  if (model.compile.tag !== 'compiled' || model.fenParse.tag !== 'valid') {
    return []
  }
  const predicate = model.compile.predicate
  return model.fenParse.value.map((entry) => ({
    fen: entry.fen,
    sans: matchingMoves(entry.position, predicate).map((match) => match.san),
  }))
}
