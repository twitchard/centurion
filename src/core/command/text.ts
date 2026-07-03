import { type ParseResult, invalid, valid } from '../parsing/types'

/**
 * The command box is a word game as much as a chess control: twenty words
 * buys you a positional idea, not per-game micromanagement. Enforced on
 * the client for feedback and on the server for real.
 */
export const COMMAND_WORD_LIMIT = 20

export const COMMAND_CHAR_LIMIT = 200

export function commandWordCount(text: string): number {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return 0
  }
  return trimmed.split(/\s+/).length
}

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
  const words = commandWordCount(trimmed)
  if (words > COMMAND_WORD_LIMIT) {
    return invalid([
      `Command is ${words} words; the limit is ${COMMAND_WORD_LIMIT}.`,
    ])
  }
  return valid(trimmed)
}
