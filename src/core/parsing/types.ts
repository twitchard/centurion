export type ParseResult<T> =
  | {
      readonly tag: 'valid'
      readonly value: T
    }
  | {
      readonly tag: 'invalid'
      readonly diagnostics: readonly string[]
    }

export function valid<T>(value: T): ParseResult<T> {
  return { tag: 'valid', value }
}

export function invalid<T>(diagnostics: readonly string[]): ParseResult<T> {
  return { tag: 'invalid', diagnostics }
}
