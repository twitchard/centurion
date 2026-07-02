import { afterEach, describe, expect, it } from 'vitest'
import { CENTURION_PERSISTENCE_KEY } from '../features/centurion-match/persistence'
import {
  clearCenturionPersistence,
  loadCenturionPersistence,
  saveCenturionPersistence,
} from './local-storage-centurion-persistence'

const globalRef = globalThis as { localStorage?: Storage | undefined }

function installFakeStorage(store: Map<string, string>): void {
  globalRef.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: () => null,
    get length() {
      return store.size
    },
  }
}

function installThrowingStorage(): void {
  const fail = (): never => {
    throw new Error('storage blocked')
  }
  globalRef.localStorage = {
    getItem: fail,
    setItem: fail,
    removeItem: fail,
    clear: fail,
    key: fail,
    length: 0,
  }
}

afterEach(() => {
  globalRef.localStorage = undefined
})

describe('local storage centurion persistence', () => {
  it('returns null without storage', () => {
    expect(loadCenturionPersistence()).toBeNull()
  })

  it('drops a corrupt entry and returns null', () => {
    const store = new Map<string, string>()
    store.set(CENTURION_PERSISTENCE_KEY, '{not json')
    installFakeStorage(store)
    expect(loadCenturionPersistence()).toBeNull()
    expect(store.has(CENTURION_PERSISTENCE_KEY)).toBe(false)
  })

  it('drops an entry that parses but fails to decode', () => {
    const store = new Map<string, string>()
    store.set(
      CENTURION_PERSISTENCE_KEY,
      JSON.stringify({ v: 999, tag: 'playing' }),
    )
    installFakeStorage(store)
    expect(loadCenturionPersistence()).toBeNull()
    expect(store.has(CENTURION_PERSISTENCE_KEY)).toBe(false)
  })

  it('survives storage that throws on every operation', () => {
    installThrowingStorage()
    expect(loadCenturionPersistence()).toBeNull()
    expect(() =>
      saveCenturionPersistence({
        v: 1,
        tag: 'waiting',
        code: '123456',
        pendingSeed: 7,
      }),
    ).not.toThrow()
    expect(() => clearCenturionPersistence()).not.toThrow()
  })

  it('round-trips a valid entry', () => {
    const store = new Map<string, string>()
    installFakeStorage(store)
    saveCenturionPersistence({
      v: 1,
      tag: 'waiting',
      code: '654321',
      pendingSeed: 7,
    })
    expect(loadCenturionPersistence()).toEqual({
      v: 1,
      tag: 'waiting',
      code: '654321',
      pendingSeed: 7,
    })
  })
})
