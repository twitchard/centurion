import {
  type NewCommandLogEntry,
  commandLogEndpoint,
  encodeNewCommandLogEntry,
} from '../core/command-log/model'
import type { CommandLogPort } from '../ports/command-log'
import { defaultFirebaseDatabaseUrl } from './firebase-match-room'

/**
 * The command log writes to the same Realtime Database that hosts
 * multiplayer rooms (VITE_FIREBASE_DATABASE_URL, or the built-in
 * default). Set VITE_COMMAND_LOG to `off` to disable logging without
 * touching multiplayer; if multiplayer's database is disabled there is
 * nowhere to write, so logging is off too.
 */
export function defaultCommandLogDatabaseUrl(): string | undefined {
  const configured = import.meta.env.VITE_COMMAND_LOG?.trim()
  if (configured !== undefined && configured.toLowerCase() === 'off') {
    return undefined
  }
  return defaultFirebaseDatabaseUrl()
}

/**
 * Appends entries via the Firebase REST API (a POST to the node pushes
 * a child with a chronologically ordered key) — plain fetch, no SDK, so
 * the main bundle stays free of Firebase until multiplayer is used.
 */
export class FirebaseCommandLogAdapter implements CommandLogPort {
  private readonly endpoint: string | undefined
  private readonly fetchImpl: typeof globalThis.fetch

  constructor(
    databaseUrl: string | undefined = defaultCommandLogDatabaseUrl(),
    fetchImpl?: typeof globalThis.fetch,
  ) {
    const trimmed = databaseUrl?.trim()
    this.endpoint = trimmed ? commandLogEndpoint(trimmed) : undefined
    this.fetchImpl = fetchImpl ?? globalThis.fetch.bind(globalThis)
  }

  record(entry: NewCommandLogEntry): void {
    if (this.endpoint === undefined) {
      return
    }
    try {
      void this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(encodeNewCommandLogEntry(entry)),
      }).catch(() => {
        // Best-effort: a lost log entry must never interrupt play.
      })
    } catch {
      // fetch itself threw (no network stack): same policy.
    }
  }
}
