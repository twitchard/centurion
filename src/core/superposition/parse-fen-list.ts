import { invalid, type ParseResult, valid } from '../parsing/types'
import type { FenBoardPosition, FenPieceSymbol, PiecePlacement } from './types'

const FEN_DELIMITER = /[\n;|]+/
const PIECE_CHARS = new Set([
  'P',
  'N',
  'B',
  'R',
  'Q',
  'K',
  'p',
  'n',
  'b',
  'r',
  'q',
  'k',
])

function splitFenInput(input: string): readonly string[] {
  return input
    .split(FEN_DELIMITER)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function parseBoardToken(boardToken: string): ParseResult<FenBoardPosition> {
  if (boardToken.length === 0) {
    return invalid(['missing board section'])
  }

  const ranks = boardToken.split('/')
  if (ranks.length !== 8) {
    return invalid([`expected 8 ranks but got ${ranks.length}`])
  }

  const pieces: PiecePlacement[] = []

  for (let fenRankIndex = 0; fenRankIndex < ranks.length; fenRankIndex++) {
    const rankToken = ranks[fenRankIndex]
    if (rankToken === undefined) {
      return invalid([`rank ${fenRankIndex + 1} is missing`])
    }

    let file = 0
    for (const token of rankToken) {
      if (token >= '1' && token <= '8') {
        file += Number.parseInt(token, 10)
      } else if (PIECE_CHARS.has(token)) {
        if (file > 7) {
          return invalid([`rank ${fenRankIndex + 1} overflows past file h`])
        }
        const boardRank = 7 - fenRankIndex
        pieces.push({
          square: boardRank * 8 + file,
          piece: token as FenPieceSymbol,
        })
        file += 1
      } else {
        return invalid([`rank ${fenRankIndex + 1} contains invalid token "${token}"`])
      }

      if (file > 8) {
        return invalid([`rank ${fenRankIndex + 1} contains too many files`])
      }
    }

    if (file !== 8) {
      return invalid([`rank ${fenRankIndex + 1} has ${file} files instead of 8`])
    }
  }

  return valid({ pieces })
}

export function parseFenList(input: string): ParseResult<readonly FenBoardPosition[]> {
  const entries = splitFenInput(input)
  if (entries.length === 0) {
    return invalid(['enter at least one FEN string'])
  }

  const diagnostics: string[] = []
  const parsed: FenBoardPosition[] = []

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    if (entry === undefined) {
      continue
    }

    const boardToken = entry.split(/\s+/)[0] ?? ''
    const board = parseBoardToken(boardToken)
    if (board.tag === 'invalid') {
      for (const diagnostic of board.diagnostics) {
        diagnostics.push(`FEN #${index + 1}: ${diagnostic}`)
      }
      continue
    }
    parsed.push(board.value)
  }

  if (diagnostics.length > 0) {
    return invalid(diagnostics)
  }

  return valid(parsed)
}
