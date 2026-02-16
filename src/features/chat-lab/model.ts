export type ChatRole = 'host' | 'guest'

export type ChatConnectionState =
  | { readonly tag: 'disconnected' }
  | { readonly tag: 'connecting'; readonly role: ChatRole }
  | { readonly tag: 'waiting'; readonly code: string }
  | { readonly tag: 'connected'; readonly code: string; readonly role: ChatRole }
  | { readonly tag: 'error'; readonly code: string | null; readonly message: string }

export type ChatLineAuthor = 'system' | 'me' | 'peer'

export interface ChatLine {
  readonly id: number
  readonly author: ChatLineAuthor
  readonly text: string
  readonly sentAt: number
}

export interface ChatLabModel {
  readonly connection: ChatConnectionState
  readonly joinCodeInput: string
  readonly draft: string
  readonly transcript: readonly ChatLine[]
  readonly nextLineId: number
}

export function initChatLabModel(): ChatLabModel {
  return {
    connection: { tag: 'disconnected' },
    joinCodeInput: '',
    draft: '',
    transcript: [
      {
        id: 0,
        author: 'system',
        text: 'P2P Chat Lab ready. Create a room or join with a 6-digit code.',
        sentAt: 0,
      },
    ],
    nextLineId: 1,
  }
}
