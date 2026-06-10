import type { CenturionModel } from '../features/centurion-match/model'
import { initCenturionModel } from '../features/centurion-match/model'
import type {
  CenturionCmd,
  CenturionMsg,
} from '../features/centurion-match/update'
import type { ChatLabModel } from '../features/chat-lab/model'
import type { ChatLabCmd, ChatLabMsg } from '../features/chat-lab/update'
import type { SuperpositionLabModel } from '../features/superposition-lab/model'
import type { SuperpositionLabMsg } from '../features/superposition-lab/update'

export type AppState =
  | { readonly tag: 'centurion-match'; readonly model: CenturionModel }
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
  | { readonly tag: 'centurion-msg'; readonly msg: CenturionMsg }

export type AppCmd =
  | { readonly tag: 'chat-lab'; readonly cmd: ChatLabCmd }
  | { readonly tag: 'centurion'; readonly cmd: CenturionCmd }

/**
 * Route matching is suffix-based because the app may be served from a
 * subpath (e.g. GitHub Pages project sites at /centurion/), where the
 * labs route is /centurion/labs rather than /labs.
 */
export function isLabsPath(path: string): boolean {
  return path === '/labs' || path.endsWith('/labs')
}

export function initAppState(): AppState {
  const path = window.location.pathname
  if (isLabsPath(path)) {
    return { tag: 'labs-menu' }
  }
  return { tag: 'centurion-match', model: initCenturionModel() }
}
