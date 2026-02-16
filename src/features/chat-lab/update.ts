import {
  decodeChatWireMessage,
  encodeChatWireMessage,
  type ChatWireMessage,
} from '../../core/chat/codec'
import type { UpdateResult } from '../../core/update'
import type { TransportStatus } from '../../ports/transport'
import type {
  ChatConnectionState,
  ChatLabModel,
  ChatLine,
  ChatLineAuthor,
  ChatRole,
} from './model'

export type ChatLabMsg =
  | { readonly tag: 'join-code-updated'; readonly value: string }
  | { readonly tag: 'draft-updated'; readonly value: string }
  | { readonly tag: 'create-room-requested' }
  | { readonly tag: 'join-room-requested' }
  | { readonly tag: 'send-draft-requested' }
  | { readonly tag: 'disconnect-requested' }
  | {
      readonly tag: 'transport-status-changed'
      readonly status: TransportStatus
      readonly code: string
      readonly isHost: boolean
    }
  | { readonly tag: 'transport-peer-joined' }
  | { readonly tag: 'transport-peer-left' }
  | { readonly tag: 'transport-message-received'; readonly payload: unknown }

export type ChatLabCmd =
  | { readonly tag: 'transport-create-room' }
  | { readonly tag: 'transport-join-room'; readonly code: string }
  | { readonly tag: 'transport-disconnect' }
  | { readonly tag: 'transport-send'; readonly payload: unknown }

function appendLine(
  model: ChatLabModel,
  author: ChatLineAuthor,
  text: string,
  sentAt: number,
): ChatLabModel {
  const line: ChatLine = {
    id: model.nextLineId,
    author,
    text,
    sentAt,
  }
  return {
    ...model,
    transcript: [...model.transcript, line],
    nextLineId: model.nextLineId + 1,
  }
}

function roleFromHostFlag(isHost: boolean): ChatRole {
  return isHost ? 'host' : 'guest'
}

function sanitizeJoinCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6)
}

function updateConnectionFromTransport(
  connection: ChatConnectionState,
  status: TransportStatus,
  code: string,
  isHost: boolean,
): ChatConnectionState {
  const role = roleFromHostFlag(isHost)

  switch (status) {
    case 'disconnected':
      return { tag: 'disconnected' }
    case 'connecting':
      return { tag: 'connecting', role }
    case 'waiting':
      return { tag: 'waiting', code }
    case 'connected':
      return { tag: 'connected', code, role }
    case 'error': {
      const knownCode = code.length > 0 ? code : connection.tag === 'waiting' ? connection.code : null
      return {
        tag: 'error',
        code: knownCode,
        message: 'Transport error while connecting.',
      }
    }
    default: {
      const exhaustive: never = status
      return connection
    }
  }
}

export function updateChatLab(
  model: ChatLabModel,
  msg: ChatLabMsg,
): UpdateResult<ChatLabModel, ChatLabCmd> {
  switch (msg.tag) {
    case 'join-code-updated':
      return [{ ...model, joinCodeInput: sanitizeJoinCode(msg.value) }, []]

    case 'draft-updated':
      return [{ ...model, draft: msg.value }, []]

    case 'create-room-requested': {
      const nextModel = appendLine(
        {
          ...model,
          connection: { tag: 'connecting', role: 'host' },
        },
        'system',
        'Creating room...',
        model.nextLineId,
      )
      return [nextModel, [{ tag: 'transport-create-room' }]]
    }

    case 'join-room-requested': {
      const code = sanitizeJoinCode(model.joinCodeInput)
      if (code.length !== 6) {
        const nextModel = appendLine(
          {
            ...model,
            connection: {
              tag: 'error',
              code: null,
              message: 'Join code must be 6 digits.',
            },
          },
          'system',
          'Join code must be exactly 6 digits.',
          model.nextLineId,
        )
        return [nextModel, []]
      }
      const nextModel = appendLine(
        {
          ...model,
          connection: { tag: 'connecting', role: 'guest' },
        },
        'system',
        `Joining room ${code}...`,
        model.nextLineId,
      )
      return [nextModel, [{ tag: 'transport-join-room', code }]]
    }

    case 'send-draft-requested': {
      if (model.connection.tag !== 'connected') {
        return [model, []]
      }
      const text = model.draft.trim()
      if (text.length === 0) {
        return [{ ...model, draft: '' }, []]
      }
      const sentAt = model.nextLineId
      const wire: ChatWireMessage = {
        type: 'chat:text',
        text,
        sentAt,
      }
      const nextModel = appendLine(
        { ...model, draft: '' },
        'me',
        text,
        sentAt,
      )
      return [
        nextModel,
        [{ tag: 'transport-send', payload: encodeChatWireMessage(wire) }],
      ]
    }

    case 'disconnect-requested': {
      const nextModel = appendLine(
        {
          ...model,
          connection: { tag: 'disconnected' },
        },
        'system',
        'Disconnected from room.',
        model.nextLineId,
      )
      return [nextModel, [{ tag: 'transport-disconnect' }]]
    }

    case 'transport-status-changed': {
      const previousTag = model.connection.tag
      const nextConnection = updateConnectionFromTransport(
        model.connection,
        msg.status,
        msg.code,
        msg.isHost,
      )

      let nextModel: ChatLabModel = {
        ...model,
        connection: nextConnection,
      }

      if (previousTag !== nextConnection.tag) {
        switch (nextConnection.tag) {
          case 'waiting':
            nextModel = appendLine(
              nextModel,
              'system',
              `Room ${nextConnection.code} created. Waiting for peer...`,
              nextModel.nextLineId,
            )
            break
          case 'connected':
            nextModel = appendLine(
              nextModel,
              'system',
              `Connected to room ${nextConnection.code}.`,
              nextModel.nextLineId,
            )
            break
          case 'disconnected':
            nextModel = appendLine(
              nextModel,
              'system',
              'Transport disconnected.',
              nextModel.nextLineId,
            )
            break
          case 'error':
            nextModel = appendLine(
              nextModel,
              'system',
              nextConnection.message,
              nextModel.nextLineId,
            )
            break
          case 'connecting':
            break
          default: {
            const exhaustive: never = nextConnection
            return [model, []]
          }
        }
      }

      return [nextModel, []]
    }

    case 'transport-peer-joined':
      return [
        appendLine(model, 'system', 'Peer joined the room.', model.nextLineId),
        [],
      ]

    case 'transport-peer-left':
      return [
        appendLine(model, 'system', 'Peer left the room.', model.nextLineId),
        [],
      ]

    case 'transport-message-received': {
      const wire = decodeChatWireMessage(msg.payload)
      if (wire === null) {
        return [
          appendLine(
            model,
            'system',
            'Ignored malformed incoming message.',
            model.nextLineId,
          ),
          [],
        ]
      }
      return [appendLine(model, 'peer', wire.text, wire.sentAt), []]
    }

    default: {
      const exhaustive: never = msg
      return [model, []]
    }
  }
}
