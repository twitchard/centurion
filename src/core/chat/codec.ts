export interface ChatWireMessage {
  readonly type: 'chat:text'
  readonly text: string
  readonly sentAt: number
}

export function encodeChatWireMessage(message: ChatWireMessage): unknown {
  return message
}

export function decodeChatWireMessage(
  payload: unknown,
): ChatWireMessage | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }

  const candidate = payload as Record<string, unknown>
  const { type, text, sentAt } = candidate
  if (type !== 'chat:text') {
    return null
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null
  }
  if (typeof sentAt !== 'number' || Number.isNaN(sentAt)) {
    return null
  }

  return {
    type,
    text,
    sentAt,
  }
}
