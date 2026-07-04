import { type ParseResult, invalid, valid } from '../parsing/types'

/**
 * The command box is deliberately short: twenty characters buys you a
 * positional idea or a literal move, not per-game micromanagement.
 * Enforced on the client for feedback and on the server for real.
 */
export const COMMAND_CHAR_LIMIT = 20

/** Trim and validate a raw command; returns the normalized text. */
export function validateCommandText(text: string): ParseResult<string> {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return invalid(['Command is empty.'])
  }
  if (trimmed.length > COMMAND_CHAR_LIMIT) {
    return invalid([
      `Command is ${trimmed.length} characters; the limit is ${COMMAND_CHAR_LIMIT}.`,
    ])
  }
  return valid(trimmed)
}
