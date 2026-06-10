export type MatchWireMessage =
  | {
      readonly type: 'centurion:start'
      readonly seed: number
      readonly gameCount: number
    }
  | {
      readonly type: 'centurion:arrow'
      readonly from: number
      readonly to: number
      readonly turn: number
      /**
       * Stockfish moves (UCI) for the games the arrows did not reach,
       * computed by the player who placed the arrow and applied verbatim
       * (after legality validation) by the opponent.
       */
      readonly moves: readonly string[]
    }
  | {
      readonly type: 'centurion:auto'
      readonly turn: number
      /**
       * Stockfish moves for arrowless turns after the placement window
       * closes (turn 101+), sent by the active placer each ply.
       */
      readonly moves: readonly string[]
    }

export function encodeMatchWireMessage(
  message: MatchWireMessage,
): Record<string, unknown> {
  return { ...message }
}

const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/

function isBoardSquare(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 63
  )
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isUciMoveList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= 1000 &&
    value.every((entry) => typeof entry === 'string' && UCI_PATTERN.test(entry))
  )
}

export function decodeMatchWireMessage(
  payload: unknown,
): MatchWireMessage | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const { type, seed, gameCount, from, to, turn, moves } = payload as Record<
    string,
    unknown
  >

  if (type === 'centurion:start') {
    if (isNonNegativeInteger(seed) && isNonNegativeInteger(gameCount)) {
      if (gameCount >= 1 && gameCount <= 1000) {
        return { type: 'centurion:start', seed, gameCount }
      }
    }
    return null
  }

  if (type === 'centurion:arrow') {
    if (
      isBoardSquare(from) &&
      isBoardSquare(to) &&
      isNonNegativeInteger(turn) &&
      isUciMoveList(moves)
    ) {
      return { type: 'centurion:arrow', from, to, turn, moves }
    }
    return null
  }

  if (type === 'centurion:auto') {
    if (isNonNegativeInteger(turn) && isUciMoveList(moves)) {
      return { type: 'centurion:auto', turn, moves }
    }
    return null
  }

  return null
}
