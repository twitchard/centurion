export interface CenturionMatchModel {
  readonly lifecycle: 'lobby'
}

export function initCenturionMatchModel(): CenturionMatchModel {
  return { lifecycle: 'lobby' }
}

export type CenturionMatchCmd =
  | { readonly tag: 'mount' }
  | { readonly tag: 'unmount' }
