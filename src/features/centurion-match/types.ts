export interface CenturionMatchModel {
  readonly lifecycle: 'inactive' | 'active'
}

export function initCenturionMatchModel(): CenturionMatchModel {
  return { lifecycle: 'inactive' }
}

export type CenturionMatchCmd =
  | { readonly tag: 'mount' }
  | { readonly tag: 'unmount' }
