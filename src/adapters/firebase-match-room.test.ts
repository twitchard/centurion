import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MatchRoomCallbacks } from '../ports/match-room'

/**
 * A minimal in-memory stand-in for Firebase Realtime Database: values
 * live in a flat path->value map shared by every adapter instance in a
 * test, and onValue listeners fire immediately with the current value
 * and again on every write to their exact path - the same contract the
 * adapter relies on.
 */
const values = new Map<string, unknown>()
const listeners = new Map<string, ((snap: FakeSnapshot) => void)[]>()

interface FakeSnapshot {
  val(): unknown
  exists(): boolean
}

interface FakeRef {
  readonly path: string
}

function snapshotFor(path: string): FakeSnapshot {
  return {
    val: () => values.get(path) ?? null,
    exists: () => values.has(path),
  }
}

function fire(path: string): void {
  for (const listener of listeners.get(path) ?? []) {
    listener(snapshotFor(path))
  }
}

function resetFakeDatabase(): void {
  values.clear()
  listeners.clear()
}

vi.mock('firebase/app', () => ({
  initializeApp: (options: { databaseURL: string }, name: string) => ({
    name,
    options,
  }),
  getApps: () => [],
}))

vi.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db: unknown, path: string): FakeRef => ({ path }),
  child: (parent: FakeRef, path: string): FakeRef => ({
    path: `${parent.path}/${path}`,
  }),
  get: async (ref: FakeRef): Promise<FakeSnapshot> => snapshotFor(ref.path),
  set: async (ref: FakeRef, value: unknown): Promise<void> => {
    values.set(ref.path, value)
    fire(ref.path)
  },
  update: async (
    ref: FakeRef,
    value: Record<string, unknown>,
  ): Promise<void> => {
    for (const [key, entry] of Object.entries(value)) {
      values.set(`${ref.path}/${key}`, entry)
      fire(`${ref.path}/${key}`)
    }
  },
  remove: async (ref: FakeRef): Promise<void> => {
    values.delete(ref.path)
    fire(ref.path)
  },
  onValue: (ref: FakeRef, callback: (snap: FakeSnapshot) => void) => {
    const existing = listeners.get(ref.path) ?? []
    listeners.set(ref.path, [...existing, callback])
    callback(snapshotFor(ref.path))
    return () => {
      listeners.set(
        ref.path,
        (listeners.get(ref.path) ?? []).filter((entry) => entry !== callback),
      )
    }
  },
  onDisconnect: (_ref: FakeRef) => ({
    remove: async () => {},
    cancel: async () => {},
  }),
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
}))

import {
  FirebaseMatchRoomAdapter,
  defaultFirebaseDatabaseUrl,
  generateRoomCode,
  roomPath,
} from './firebase-match-room'

interface RecordedCallbacks extends MatchRoomCallbacks {
  readonly opened: () => number
  readonly errors: () => readonly string[]
  readonly presence: () => readonly boolean[]
  readonly states: () => readonly unknown[]
}

function recordingCallbacks(): RecordedCallbacks {
  let openedCount = 0
  const errorLog: string[] = []
  const presenceLog: boolean[] = []
  const stateLog: unknown[] = []
  return {
    onOpened: () => {
      openedCount += 1
    },
    onError: (message) => {
      errorLog.push(message)
    },
    onPeerPresence: (present) => {
      presenceLog.push(present)
    },
    onState: (state) => {
      stateLog.push(state)
    },
    opened: () => openedCount,
    errors: () => errorLog,
    presence: () => presenceLog,
    states: () => stateLog,
  }
}

/**
 * Let the adapter's async open/publish chains settle. Dynamic imports
 * resolve on macrotasks, so plain microtask flushing is not enough.
 */
async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('falls back to the built-in database when unset or empty', () => {
    vi.stubEnv('VITE_FIREBASE_DATABASE_URL', '')
    expect(defaultFirebaseDatabaseUrl()).toContain('firebaseio.com')
  })

  it('uses a configured database URL', () => {
    vi.stubEnv('VITE_FIREBASE_DATABASE_URL', 'https://example.firebaseio.com')
    expect(defaultFirebaseDatabaseUrl()).toBe('https://example.firebaseio.com')
  })

  it('disables multiplayer when set to off', () => {
    vi.stubEnv('VITE_FIREBASE_DATABASE_URL', 'off')
    expect(defaultFirebaseDatabaseUrl()).toBeUndefined()
  })

  it('generates 6-digit room codes', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(generateRoomCode()).toMatch(/^[1-9]\d{5}$/)
    }
  })

  it('keeps rooms inside the writable database subtree', () => {
    expect(roomPath('123456')).toBe('__trystero__/centurion-rooms/123456')
  })
})

describe('FirebaseMatchRoomAdapter', () => {
  beforeEach(() => {
    resetFakeDatabase()
  })

  it('reports an error instead of opening when multiplayer is disabled', async () => {
    vi.stubEnv('VITE_FIREBASE_DATABASE_URL', 'off')
    const adapter = new FirebaseMatchRoomAdapter()
    vi.unstubAllEnvs()
    const callbacks = recordingCallbacks()
    adapter.setCallbacks(callbacks)

    adapter.open('123456', 'host', 42)
    await flushAsyncWork()

    expect(callbacks.opened()).toBe(0)
    expect(callbacks.errors()).toHaveLength(1)
  })

  it('host creates the room record, marks presence, and opens', async () => {
    const adapter = new FirebaseMatchRoomAdapter('https://test.firebaseio.com')
    const callbacks = recordingCallbacks()
    adapter.setCallbacks(callbacks)

    adapter.open('123456', 'host', 42)
    await flushAsyncWork()

    expect(callbacks.opened()).toBe(1)
    expect(callbacks.errors()).toEqual([])
    expect(values.get(`${roomPath('123456')}/seed`)).toBe(42)
    expect(values.get(`${roomPath('123456')}/presence/host`)).toBe(true)
  })

  it('guest joining a missing room gets an error, not a hang', async () => {
    const adapter = new FirebaseMatchRoomAdapter('https://test.firebaseio.com')
    const callbacks = recordingCallbacks()
    adapter.setCallbacks(callbacks)

    adapter.open('999999', 'guest')
    await flushAsyncWork()

    expect(callbacks.opened()).toBe(0)
    expect(callbacks.errors()).toHaveLength(1)
    expect(callbacks.errors()[0]).toContain('No match found')
  })

  it('host sees guest presence and the guest receives published state', async () => {
    const host = new FirebaseMatchRoomAdapter('https://test.firebaseio.com')
    const hostCallbacks = recordingCallbacks()
    host.setCallbacks(hostCallbacks)
    host.open('123456', 'host', 42)
    await flushAsyncWork()

    const guest = new FirebaseMatchRoomAdapter('https://test.firebaseio.com')
    const guestCallbacks = recordingCallbacks()
    guest.setCallbacks(guestCallbacks)
    guest.open('123456', 'guest')
    await flushAsyncWork()

    expect(guestCallbacks.opened()).toBe(1)
    expect(hostCallbacks.presence()).toContain(true)
    expect(guestCallbacks.presence()).toContain(true)

    host.publishState({ turn: 1, games: [] })
    await flushAsyncWork()

    expect(guestCallbacks.states()).toContainEqual({ turn: 1, games: [] })
  })

  it('leave removes presence and stops delivering room events', async () => {
    const host = new FirebaseMatchRoomAdapter('https://test.firebaseio.com')
    const hostCallbacks = recordingCallbacks()
    host.setCallbacks(hostCallbacks)
    host.open('123456', 'host', 42)
    await flushAsyncWork()

    const guest = new FirebaseMatchRoomAdapter('https://test.firebaseio.com')
    guest.setCallbacks(recordingCallbacks())
    guest.open('123456', 'guest')
    await flushAsyncWork()

    const statesBefore = hostCallbacks.states().length
    host.leave()
    await flushAsyncWork()

    expect(values.has(`${roomPath('123456')}/presence/host`)).toBe(false)
    guest.publishState({ turn: 2, games: [] })
    await flushAsyncWork()
    expect(hostCallbacks.states()).toHaveLength(statesBefore)
  })
})
