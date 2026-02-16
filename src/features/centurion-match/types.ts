export interface CenturionMatchModel {
  readonly lifecycle: 'idle' | 'active' | 'resolving' | 'complete'
}

export function initCenturionMatchModel(): CenturionMatchModel {
  return { lifecycle: 'idle' }
}

export type CenturionMatchCmd =
  | { readonly tag: 'mount' }
  | { readonly tag: 'unmount' }
