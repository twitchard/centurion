import {
  CENTURION_PERSISTENCE_KEY,
  type PersistedCenturion,
  decodePersistedCenturion,
} from '../features/centurion-match/persistence'

/**
 * Storage access must never take the app down: getItem/setItem can
 * throw (private browsing, blocked third-party storage, quota), and a
 * corrupt entry would otherwise break every load until manually
 * cleared. Failures degrade to "no saved session" and drop the entry.
 */
export function loadCenturionPersistence(): PersistedCenturion | null {
  if (typeof localStorage === 'undefined') {
    return null
  }
  try {
    const raw = localStorage.getItem(CENTURION_PERSISTENCE_KEY)
    if (raw === null) {
      return null
    }
    const decoded = decodePersistedCenturion(JSON.parse(raw))
    if (decoded === null) {
      clearCenturionPersistence()
    }
    return decoded
  } catch {
    clearCenturionPersistence()
    return null
  }
}

export function saveCenturionPersistence(data: PersistedCenturion): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  try {
    localStorage.setItem(CENTURION_PERSISTENCE_KEY, JSON.stringify(data))
  } catch {
    // Quota or blocked storage: play on without persistence.
  }
}

export function clearCenturionPersistence(): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  try {
    localStorage.removeItem(CENTURION_PERSISTENCE_KEY)
  } catch {
    // Blocked storage: nothing to clean up.
  }
}
