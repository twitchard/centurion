export interface CenturionMatchModel {}

export function initCenturionMatchModel(): CenturionMatchModel {
  return {}
}

export type CenturionMatchCmd =
  | { readonly tag: 'mount' }
  | { readonly tag: 'unmount' }
