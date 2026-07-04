import type {
  CommandPredicate,
  FileLetter,
  PieceRole,
  SquareRegion,
} from './model'
import { FILE_LETTERS } from './model'

const PIECE_LETTER_TO_ROLE: Record<string, PieceRole> = {
  N: 'knight',
  B: 'bishop',
  R: 'rook',
  Q: 'queen',
  K: 'king',
}

function parseFile(letter: string): FileLetter | null {
  const file = letter.toLowerCase()
  return FILE_LETTERS.includes(file as FileLetter) ? (file as FileLetter) : null
}

function parseRank(digit: string): number | null {
  const rank = Number.parseInt(digit, 10)
  return rank >= 1 && rank <= 8 ? rank : null
}

function squareRegion(file: string, rank: string): SquareRegion | null {
  const parsedFile = parseFile(file)
  const parsedRank = parseRank(rank)
  if (parsedFile === null || parsedRank === null) {
    return null
  }
  return {
    files: { from: parsedFile, to: parsedFile },
    ranks: { from: parsedRank, to: parsedRank },
    absolute: true,
  }
}

function fileRegion(file: string): SquareRegion | null {
  const parsedFile = parseFile(file)
  if (parsedFile === null) {
    return null
  }
  return { files: { from: parsedFile, to: parsedFile } }
}

function piecePredicate(role: PieceRole): CommandPredicate {
  return { tag: 'piece', roles: [role] }
}

function toPredicate(region: SquareRegion): CommandPredicate {
  return { tag: 'to', region }
}

function fromPredicate(region: SquareRegion): CommandPredicate {
  return { tag: 'from', region }
}

function combine(...parts: CommandPredicate[]): CommandPredicate {
  if (parts.length === 1) {
    return parts[0]!
  }
  return { tag: 'and', all: parts }
}

/**
 * Compile standard chess notation directly into a move predicate, bypassing
 * the LLM. Returns null when the text is not unambiguous literal notation.
 *
 * Square names use standard board coordinates (rank 1 = White's back rank).
 * Bare squares like `c5` mean a pawn to that square. Natural-language
 * commands compiled by the LLM still use mover-relative ranks.
 */
export function tryCompileLiteralNotation(
  text: string,
): CommandPredicate | null {
  const normalized = text.trim().replace(/[+#]$/, '')
  if (normalized.length === 0) {
    return null
  }

  if (/^(?:O-O-O|0-0-0)$/i.test(normalized)) {
    return { tag: 'castles' }
  }
  if (/^(?:O-O|0-0)$/i.test(normalized)) {
    return { tag: 'castles' }
  }

  if (/^checkmate$/i.test(normalized)) {
    return { tag: 'checkmates' }
  }
  if (/^(?:give|deliver)\s+checkmate$/i.test(normalized)) {
    return { tag: 'checkmates' }
  }
  if (/^mate$/i.test(normalized)) {
    return { tag: 'checkmates' }
  }

  if (/^pxp$/i.test(normalized)) {
    return combine(piecePredicate('pawn'), {
      tag: 'captures',
      roles: ['pawn'],
    })
  }

  const uci = /^([a-h])([1-8])([a-h])([1-8])([qrbn])?$/i.exec(normalized)
  if (uci !== null) {
    const from = squareRegion(uci[1]!, uci[2]!)
    const to = squareRegion(uci[3]!, uci[4]!)
    if (from === null || to === null) {
      return null
    }
    const parts: CommandPredicate[] = [fromPredicate(from), toPredicate(to)]
    if (uci[5] !== undefined) {
      parts.push(piecePredicate('pawn'), { tag: 'promotes' })
    }
    return combine(...parts)
  }

  const bareSquare = /^([a-h])([1-8])$/i.exec(normalized)
  if (bareSquare !== null) {
    const region = squareRegion(bareSquare[1]!, bareSquare[2]!)
    if (region === null) {
      return null
    }
    return combine(piecePredicate('pawn'), toPredicate(region))
  }

  const pieceSquare = /^([NBRQK])([a-h])([1-8])$/i.exec(normalized)
  if (pieceSquare !== null) {
    const role = PIECE_LETTER_TO_ROLE[pieceSquare[1]!.toUpperCase()]
    const region = squareRegion(pieceSquare[2]!, pieceSquare[3]!)
    if (role === undefined || region === null) {
      return null
    }
    return combine(piecePredicate(role), toPredicate(region))
  }

  const pieceCapture = /^([NBRQK])x([a-h])([1-8])$/i.exec(normalized)
  if (pieceCapture !== null) {
    const role = PIECE_LETTER_TO_ROLE[pieceCapture[1]!.toUpperCase()]
    const region = squareRegion(pieceCapture[2]!, pieceCapture[3]!)
    if (role === undefined || region === null) {
      return null
    }
    return combine(
      piecePredicate(role),
      { tag: 'captures' },
      toPredicate(region),
    )
  }

  const pawnCapture = /^([a-h])x([a-h])([1-8])$/i.exec(normalized)
  if (pawnCapture !== null) {
    const from = fileRegion(pawnCapture[1]!)
    const to = squareRegion(pawnCapture[2]!, pawnCapture[3]!)
    if (from === null || to === null) {
      return null
    }
    return combine(
      piecePredicate('pawn'),
      { tag: 'captures' },
      fromPredicate(from),
      toPredicate(to),
    )
  }

  const pawnDisambiguation = /^([a-h])([a-h])([1-8])$/i.exec(normalized)
  if (pawnDisambiguation !== null) {
    const from = fileRegion(pawnDisambiguation[1]!)
    const to = squareRegion(pawnDisambiguation[2]!, pawnDisambiguation[3]!)
    if (from === null || to === null) {
      return null
    }
    return combine(piecePredicate('pawn'), fromPredicate(from), toPredicate(to))
  }

  const promotion = /^([a-h])([1-8])=([QRBN])$/i.exec(normalized)
  if (promotion !== null) {
    const region = squareRegion(promotion[1]!, promotion[2]!)
    if (region === null) {
      return null
    }
    return combine(piecePredicate('pawn'), toPredicate(region), {
      tag: 'promotes',
    })
  }

  const pawnCapturePromotion = /^([a-h])x([a-h])([1-8])=([QRBN])$/i.exec(
    normalized,
  )
  if (pawnCapturePromotion !== null) {
    const from = fileRegion(pawnCapturePromotion[1]!)
    const to = squareRegion(pawnCapturePromotion[2]!, pawnCapturePromotion[3]!)
    if (from === null || to === null) {
      return null
    }
    return combine(
      piecePredicate('pawn'),
      { tag: 'captures' },
      fromPredicate(from),
      toPredicate(to),
      { tag: 'promotes' },
    )
  }

  return null
}
