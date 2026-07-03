import type { CommandPredicate } from '../core/command/model'

export type CommandCompileResult =
  | { readonly tag: 'compiled'; readonly predicate: CommandPredicate }
  | { readonly tag: 'failed'; readonly message: string }

/** Compiles a natural-language command into a move predicate. */
export interface CommandCompilerPort {
  compile(endpoint: string, command: string): Promise<CommandCompileResult>
}
