import type { ChatLabCmd, ChatLabMsg } from '../features/chat-lab/update'
import type {
  CenturionMatchCmd,
  CenturionMatchModel,
} from '../features/centurion-match/types'
import type {
  SuperpositionLabCmd,
  SuperpositionLabMsg,
} from '../features/superposition-lab/update'
import type { ChatLabModel } from '../features/chat-lab/model'
import type { SuperpositionLabModel } from '../features/superposition-lab/model'

export type AppState =
  | { readonly tag: 'menu' }
  | { readonly tag: 'superposition-lab'; readonly model: SuperpositionLabModel }
  | { readonly tag: 'chat-lab'; readonly model: ChatLabModel }
  | { readonly tag: 'centurion-match'; readonly model: CenturionMatchModel }

export type AppMsg =
  | { readonly tag: 'open-superposition-lab' }
  | { readonly tag: 'open-chat-lab' }
  | { readonly tag: 'open-centurion-match' }
  | { readonly tag: 'back-to-menu' }
  | { readonly tag: 'superposition-lab-msg'; readonly msg: SuperpositionLabMsg }
  | { readonly tag: 'chat-lab-msg'; readonly msg: ChatLabMsg }

export type AppCmd =
  | { readonly tag: 'chat-lab'; readonly cmd: ChatLabCmd }
  | { readonly tag: 'centurion-match'; readonly cmd: CenturionMatchCmd }
  | { readonly tag: 'superposition-lab'; readonly cmd: SuperpositionLabCmd }

export function initAppState(): AppState {
  return { tag: 'menu' }
}
