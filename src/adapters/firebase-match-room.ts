import type { DatabaseReference, Unsubscribe } from 'firebase/database'
import {
  type MatchRoomCallbacks,
  type MatchRoomPort,
  NOOP_MATCH_ROOM_CALLBACKS,
  type RoomRole,
} from '../ports/match-room'

/**
 * The default is the project's own free Firebase Realtime Database. The URL is
 * not a secret - like any client config it ships in the bundle, and the
 * database rules are what gate access (only the `__trystero__` subtree is
 * writable; rooms are ephemeral and hold no personal data).
 *
 * VITE_FIREBASE_DATABASE_URL overrides the default with another database URL.
 * Unset or empty falls back to the default (an unset CI secret expands to an
 * empty string, so empty must not mean "disabled"). Set it to `off` to disable
 * multiplayer entirely.
 */
const DEFAULT_FIREBASE_DATABASE_URL =
  'https://centurion-chess-default-rtdb.firebaseio.com'

export function defaultFirebaseDatabaseUrl(): string | undefined {
  const configured = import.meta.env.VITE_FIREBASE_DATABASE_URL?.trim()
  if (!configured) {
    return DEFAULT_FIREBASE_DATABASE_URL
  }
  if (configured.toLowerCase() === 'off') {
    return undefined
  }
  return configured
}

/**
 * Rooms live under `__trystero__` because that is the subtree the deployed
 * database rules leave writable (a relic of the old WebRTC-signalling design,
 * kept so existing databases keep working without a rules change).
 */
export function roomPath(code: string): string {
  return `__trystero__/centurion-rooms/${code}`
}

export function generateRoomCode(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000))
}

const MULTIPLAYER_DISABLED_COPY = 'Multiplayer is disabled in this build.'
const ROOM_NOT_FOUND_COPY =
  'No match found for that code. Check the code with the host and try again.'
const CONNECT_FAILED_COPY =
  'Could not reach the match server. Check your connection and try again.'
const PUBLISH_FAILED_COPY =
  'Could not sync your move to the match server. Check your connection.'

/**
 * The Firebase SDK retries an unreachable database forever; without a
 * deadline a blocked network leaves the player stuck on "Creating
 * match..." with no feedback.
 */
const OPEN_TIMEOUT_MS = 15_000

type FirebaseDatabaseModule = typeof import('firebase/database')

interface OpenRoom {
  readonly db: FirebaseDatabaseModule
  readonly roomRef: DatabaseReference
  readonly presenceRef: DatabaseReference
  readonly unsubscribes: readonly Unsubscribe[]
}

function otherRole(role: RoomRole): RoomRole {
  return role === 'host' ? 'guest' : 'host'
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Multiplayer over Firebase Realtime Database: the room is a small record
 * (`seed`, per-player `presence`, and the latest match snapshot as a JSON
 * string under `state`). No WebRTC, no NAT traversal - anything that can
 * reach Google over HTTPS can play. The SDK is loaded lazily so the main
 * bundle stays free of Firebase until multiplayer is actually used.
 */
export class FirebaseMatchRoomAdapter implements MatchRoomPort {
  private callbacks: MatchRoomCallbacks = NOOP_MATCH_ROOM_CALLBACKS
  private room: OpenRoom | null = null
  private generation = 0
  private readonly databaseUrl: string | undefined
  private sdkPromise: Promise<{
    db: FirebaseDatabaseModule
    dbInstance: import('firebase/database').Database
  }> | null = null

  constructor(databaseUrl: string | undefined = defaultFirebaseDatabaseUrl()) {
    const trimmed = databaseUrl?.trim()
    this.databaseUrl = trimmed ? trimmed : undefined
  }

  setCallbacks(callbacks: MatchRoomCallbacks): void {
    this.callbacks = callbacks
  }

  open(code: string, role: RoomRole, seed?: number): void {
    this.leave()
    const generation = this.generation
    const deadline = setTimeout(() => {
      if (generation !== this.generation) {
        return
      }
      // Abandon the in-flight open: bumping the generation makes its
      // remaining steps no-ops.
      this.generation += 1
      this.log(`Room open timed out after ${OPEN_TIMEOUT_MS / 1000}s.`)
      this.callbacks.onError(CONNECT_FAILED_COPY)
    }, OPEN_TIMEOUT_MS)
    void this.doOpen(code, role, seed)
      .catch((error: unknown) => {
        if (generation !== this.generation) {
          return
        }
        this.log(`Room open failed: ${errorDetail(error)}`)
        this.callbacks.onError(CONNECT_FAILED_COPY)
      })
      .finally(() => {
        clearTimeout(deadline)
      })
  }

  publishState(state: unknown): void {
    const room = this.room
    if (room === null) {
      return
    }
    const generation = this.generation
    const stateRef = room.db.child(room.roomRef, 'state')
    room.db.set(stateRef, JSON.stringify(state)).catch((error: unknown) => {
      if (generation !== this.generation) {
        return
      }
      this.log(`State publish failed: ${errorDetail(error)}`)
      this.callbacks.onError(PUBLISH_FAILED_COPY)
    })
  }

  leave(): void {
    this.generation += 1
    const room = this.room
    this.room = null
    if (room === null) {
      return
    }
    for (const unsubscribe of room.unsubscribes) {
      unsubscribe()
    }
    void room.db.onDisconnect(room.presenceRef).cancel()
    void room.db.remove(room.presenceRef).catch(() => {
      // Best-effort: onDisconnect cleans this up server-side anyway.
    })
  }

  private log(message: string): void {
    this.callbacks.onLog?.(message)
  }

  private loadSdk(databaseUrl: string) {
    this.sdkPromise ??= (async () => {
      const [{ initializeApp, getApps }, db] = await Promise.all([
        import('firebase/app'),
        import('firebase/database'),
      ])
      const name = `centurion-${databaseUrl}`
      const app =
        getApps().find((existing) => existing.name === name) ??
        initializeApp({ databaseURL: databaseUrl }, name)
      return { db, dbInstance: db.getDatabase(app) }
    })()
    return this.sdkPromise
  }

  private async doOpen(
    code: string,
    role: RoomRole,
    seed?: number,
  ): Promise<void> {
    if (this.databaseUrl === undefined) {
      this.callbacks.onError(MULTIPLAYER_DISABLED_COPY)
      return
    }
    const generation = this.generation
    const { db, dbInstance } = await this.loadSdk(this.databaseUrl)
    if (generation !== this.generation) {
      return
    }
    const roomRef = db.ref(dbInstance, roomPath(code))

    if (seed !== undefined) {
      await db.update(roomRef, { seed, createdAt: db.serverTimestamp() })
      this.log(`Room ${code} created (seed ${seed}).`)
    } else if (role === 'guest') {
      const existing = await db.get(db.child(roomRef, 'seed'))
      if (generation !== this.generation) {
        return
      }
      if (!existing.exists()) {
        this.callbacks.onError(ROOM_NOT_FOUND_COPY)
        return
      }
    }
    if (generation !== this.generation) {
      return
    }

    const presenceRef = db.child(roomRef, `presence/${role}`)
    await db.onDisconnect(presenceRef).remove()
    await db.set(presenceRef, true)
    if (generation !== this.generation) {
      // leave() raced this open; undo the presence we just wrote.
      void db.remove(presenceRef).catch(() => {})
      return
    }

    const unsubscribes: Unsubscribe[] = []
    unsubscribes.push(
      db.onValue(db.child(roomRef, `presence/${otherRole(role)}`), (snap) => {
        this.callbacks.onPeerPresence(snap.val() === true)
      }),
    )
    unsubscribes.push(
      db.onValue(db.child(roomRef, 'state'), (snap) => {
        const raw: unknown = snap.val()
        if (typeof raw !== 'string') {
          return
        }
        try {
          this.callbacks.onState(JSON.parse(raw))
        } catch {
          this.log('Ignored unparseable room state.')
        }
      }),
    )
    unsubscribes.push(
      db.onValue(db.ref(dbInstance, '.info/connected'), (snap) => {
        this.log(
          snap.val() === true
            ? 'Realtime database connected.'
            : 'Realtime database connection lost; retrying...',
        )
      }),
    )

    this.room = { db, roomRef, presenceRef, unsubscribes }
    this.log(`Joined room ${code} as ${role}.`)
    this.callbacks.onOpened()
  }
}
