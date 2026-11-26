import {
  type DrawingCorrection,
  type NewSavedDrawing,
  drawingLogEndpoint,
  drawingLogEntryEndpoint,
  encodeNewDrawing,
} from '../core/ink/drawing-log'
import { defaultFirebaseDatabaseUrl } from './firebase-match-room'

/**
 * Appends committed drawings to the same Realtime Database as multiplayer
 * (VITE_FIREBASE_DATABASE_URL, or the built-in default). Writes go under
 * `__trystero__/centurion-drawings`, the subtree the rules already allow.
 * Saving is best-effort: a lost drawing must never interrupt play.
 */
export class FirebaseDrawingLogAdapter {
  private readonly databaseUrl: string | undefined
  private readonly fetchImpl: typeof globalThis.fetch

  constructor(
    databaseUrl: string | undefined = defaultFirebaseDatabaseUrl(),
    fetchImpl?: typeof globalThis.fetch,
  ) {
    const trimmed = databaseUrl?.trim()
    this.databaseUrl = trimmed ? trimmed : undefined
    this.fetchImpl = fetchImpl ?? globalThis.fetch.bind(globalThis)
  }

  get enabled(): boolean {
    return this.databaseUrl !== undefined
  }

  /** POST the drawing. Resolves to the push key, or null if it was not saved. */
  save(entry: NewSavedDrawing): Promise<string | null> {
    if (this.databaseUrl === undefined) {
      return Promise.resolve(null)
    }
    const endpoint = drawingLogEndpoint(this.databaseUrl)
    return this.fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(encodeNewDrawing(entry)),
    })
      .then(async (response) => {
        if (!response.ok) {
          return null
        }
        const body: unknown = await response.json()
        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
          return null
        }
        const name = (body as { readonly name?: unknown }).name
        return typeof name === 'string' && name.length > 0 ? name : null
      })
      .catch(() => null)
  }

  /** Merge a fix-it label into an existing drawing. */
  correct(id: string, expect: readonly DrawingCorrection[]): Promise<boolean> {
    if (this.databaseUrl === undefined || id.length === 0) {
      return Promise.resolve(false)
    }
    const endpoint = drawingLogEntryEndpoint(this.databaseUrl, id)
    return this.fetchImpl(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expect, corrected: true }),
    })
      .then((response) => response.ok)
      .catch(() => false)
  }
}
