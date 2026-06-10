import {
  CENTURION_PERSISTENCE_KEY,
  type PersistedCenturion,
  decodePersistedCenturion,
} from '../features/centurion-match/persistence'

export function loadCenturionPersistence(): PersistedCenturion | null {
  if (typeof localStorage === 'undefined') {
    return null
  }
  const raw = localStorage.getItem(CENTURION_PERSISTENCE_KEY)
  if (raw === null) {
    return null
  }
  try {
    return decodePersistedCenturion(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveCenturionPersistence(data: PersistedCenturion): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(CENTURION_PERSISTENCE_KEY, JSON.stringify(data))
}

export function clearCenturionPersistence(): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.removeItem(CENTURION_PERSISTENCE_KEY)
}
