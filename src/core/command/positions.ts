import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { type ParseResult, invalid, valid } from '../parsing/types'

export interface CommandLabPosition {
  readonly fen: string
  readonly position: Chess
}

export const DEFAULT_POSITION_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/**
 * Parse a newline/semicolon separated FEN list into playable positions.
 * Unlike the superposition lab's piece-placement parser, commands need
 * full positions (side to move, castling rights, en passant) to enumerate
 * legal moves.
 */
export function parseCommandLabPositions(
  input: string,
): ParseResult<readonly CommandLabPosition[]> {
  const entries = input
    .split(/[\n;]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (entries.length === 0) {
    return invalid(['Provide at least one FEN.'])
  }
  const diagnostics: string[] = []
  const positions: CommandLabPosition[] = []
  entries.forEach((fen, index) => {
    const setup = parseFen(fen)
    if (setup.isErr) {
      diagnostics.push(`FEN ${index + 1}: ${setup.error.message}`)
      return
    }
    const position = Chess.fromSetup(setup.value)
    if (position.isErr) {
      diagnostics.push(`FEN ${index + 1}: ${position.error.message}`)
      return
    }
    positions.push({ fen, position: position.value })
  })
  if (diagnostics.length > 0) {
    return invalid(diagnostics)
  }
  return valid(positions)
}
