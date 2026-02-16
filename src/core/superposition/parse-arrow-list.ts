import { type ParseResult, invalid, valid } from '../parsing/types'
import type { ArrowCoordinate, ArrowSegment } from './types'

const ARROW_DELIMITER = /[\n,;|]+/
const ARROW_PATTERN = /^([a-h][1-8])\s*(?:->|-)\s*([a-h][1-8])$/i

function parseSquare(square: string): ArrowCoordinate {
  const col = square.charCodeAt(0) - 97
  const row = Number.parseInt(square.slice(1), 10) - 1
  return { col, row }
}

export function parseArrowList(
  input: string,
): ParseResult<readonly ArrowSegment[]> {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return valid([])
  }

  const diagnostics: string[] = []
  const arrows: ArrowSegment[] = []

  const entries = trimmed
    .split(ARROW_DELIMITER)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    if (entry === undefined) {
      continue
    }

    const match = ARROW_PATTERN.exec(entry.toLowerCase())
    if (match === null) {
      diagnostics.push(
        `Arrow #${index + 1}: expected "<from>-><to>" like "e2->e4", got "${entry}"`,
      )
      continue
    }

    const fromToken = match[1]
    const toToken = match[2]
    if (fromToken === undefined || toToken === undefined) {
      diagnostics.push(
        `Arrow #${index + 1}: expected "<from>-><to>" like "e2->e4", got "${entry}"`,
      )
      continue
    }

    arrows.push({
      from: parseSquare(fromToken),
      to: parseSquare(toToken),
    })
  }

  if (diagnostics.length > 0) {
    return invalid(diagnostics)
  }

  return valid(arrows)
}
