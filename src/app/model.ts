import type { CenturionMatchCmd } from '../features/centurion-match/types'
import type { ChatLabModel } from '../features/chat-lab/model'
import type { ChatLabCmd, ChatLabMsg } from '../features/chat-lab/update'
import type { SuperpositionLabModel } from '../features/superposition-lab/model'
import type { SuperpositionLabMsg } from '../features/superposition-lab/update'

export type AppState =
  | { readonly tag: 'centurion-match' }
  | { readonly tag: 'labs-menu' }
  | { readonly tag: 'superposition-lab'; readonly model: SuperpositionLabModel }
  | { readonly tag: 'chat-lab'; readonly model: ChatLabModel }

export type AppMsg =
  | { readonly tag: 'navigate'; readonly path: string }
  | { readonly tag: 'open-superposition-lab' }
  | { readonly tag: 'open-chat-lab' }
  | { readonly tag: 'open-centurion-match' }
  | { readonly tag: 'back-to-labs-menu' }
  | { readonly tag: 'superposition-lab-msg'; readonly msg: SuperpositionLabMsg }
  | { readonly tag: 'chat-lab-msg'; readonly msg: ChatLabMsg }

export type AppCmd =
  | { readonly tag: 'chat-lab'; readonly cmd: ChatLabCmd }
  | { readonly tag: 'centurion-match'; readonly cmd: CenturionMatchCmd }

export function initAppState(): AppState {
  const path = window.location.pathname
  if (path === '/labs') {
    return { tag: 'labs-menu' }
  }
  return { tag: 'centurion-match' }
}
