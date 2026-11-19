import type { CenturionModel } from '../features/centurion-match/model'
import { initCenturionModel } from '../features/centurion-match/model'
import type {
  CenturionCmd,
  CenturionMsg,
} from '../features/centurion-match/update'
import type { CommandLabModel } from '../features/command-lab/model'
import type {
  CommandLabCmd,
  CommandLabMsg,
} from '../features/command-lab/update'
import { bootInkSession } from '../features/ink-match/model'
import type { InkCmd, InkModel, InkMsg } from '../features/ink-match/model'
import type { SuperpositionLabModel } from '../features/superposition-lab/model'
import type { SuperpositionLabMsg } from '../features/superposition-lab/update'
import { type AppRoute, pathnameToAppRoute } from '../routing'

export type AppState =
  | { readonly tag: 'centurion-match'; readonly model: CenturionModel }
  | { readonly tag: 'ink-match'; readonly model: InkModel }
  | { readonly tag: 'labs-menu' }
  | { readonly tag: 'superposition-lab'; readonly model: SuperpositionLabModel }
  | { readonly tag: 'command-lab'; readonly model: CommandLabModel }

export type AppMsg =
  | {
      readonly tag: 'navigate'
      readonly route: AppRoute
      readonly seed?: number
    }
  | { readonly tag: 'open-superposition-lab' }
  | { readonly tag: 'open-command-lab' }
  | { readonly tag: 'open-centurion-match' }
  | { readonly tag: 'back-to-labs-menu' }
  | { readonly tag: 'superposition-lab-msg'; readonly msg: SuperpositionLabMsg }
  | { readonly tag: 'command-lab-msg'; readonly msg: CommandLabMsg }
  | { readonly tag: 'centurion-msg'; readonly msg: CenturionMsg }
  | { readonly tag: 'ink-msg'; readonly msg: InkMsg }

export type AppCmd =
  | { readonly tag: 'centurion'; readonly cmd: CenturionCmd }
  | { readonly tag: 'command-lab'; readonly cmd: CommandLabCmd }
  | { readonly tag: 'ink'; readonly cmd: InkCmd }

export function initAppState(seed = 1): AppState {
  const route = pathnameToAppRoute(window.location.pathname)
  if (route === 'labs') {
    return { tag: 'labs-menu' }
  }
  if (route === 'play') {
    return { tag: 'centurion-match', model: initCenturionModel() }
  }
  const [model] = bootInkSession(seed, 'fair')
  return { tag: 'ink-match', model }
}
