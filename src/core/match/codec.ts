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
    }

export function encodeMatchWireMessage(
  message: MatchWireMessage,
): Record<string, unknown> {
  return { ...message }
}

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

export function decodeMatchWireMessage(
  payload: unknown,
): MatchWireMessage | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const { type, seed, gameCount, from, to, turn } = payload as Record<
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
      isNonNegativeInteger(turn)
    ) {
      return { type: 'centurion:arrow', from, to, turn }
    }
    return null
  }

  return null
}
