import type { CenturionModel } from '../features/centurion-match/model'
import { initCenturionModel } from '../features/centurion-match/model'
import type {
  CenturionCmd,
  CenturionMsg,
} from '../features/centurion-match/update'
import type { SuperpositionLabModel } from '../features/superposition-lab/model'
import type { SuperpositionLabMsg } from '../features/superposition-lab/update'
import { type AppRoute, pathnameToAppRoute } from '../routing'

export type AppState =
  | { readonly tag: 'centurion-match'; readonly model: CenturionModel }
  | { readonly tag: 'labs-menu' }
  | { readonly tag: 'superposition-lab'; readonly model: SuperpositionLabModel }

export type AppMsg =
  | { readonly tag: 'navigate'; readonly route: AppRoute }
  | { readonly tag: 'open-superposition-lab' }
  | { readonly tag: 'open-centurion-match' }
  | { readonly tag: 'back-to-labs-menu' }
  | { readonly tag: 'superposition-lab-msg'; readonly msg: SuperpositionLabMsg }
  | { readonly tag: 'centurion-msg'; readonly msg: CenturionMsg }

export type AppCmd = { readonly tag: 'centurion'; readonly cmd: CenturionCmd }

export function initAppState(): AppState {
  if (pathnameToAppRoute(window.location.pathname) === 'labs') {
    return { tag: 'labs-menu' }
  }
  return { tag: 'centurion-match', model: initCenturionModel() }
}
