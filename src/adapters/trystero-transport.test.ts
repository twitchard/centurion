import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const joinNostrRoomMock = vi.fn()
const joinTorrentRoomMock = vi.fn()
const joinFirebaseRoomMock = vi.fn()
const getNostrRelaySocketsMock = vi.fn(() => ({}))
const getTorrentRelaySocketsMock = vi.fn(() => ({}))
const initializeAppMock = vi.fn(
  (options: { databaseURL: string }, name: string) => ({
    name,
    options,
  }),
)

vi.mock('trystero', () => ({
  joinRoom: (...args: unknown[]) => joinNostrRoomMock(...args),
}))

vi.mock('trystero/torrent', () => ({
  joinRoom: (...args: unknown[]) => joinTorrentRoomMock(...args),
  getRelaySockets: () => getTorrentRelaySocketsMock(),
}))

vi.mock('trystero/nostr', () => ({
  getRelaySockets: () => getNostrRelaySocketsMock(),
}))

vi.mock('trystero/firebase', () => ({
  joinRoom: (...args: unknown[]) => joinFirebaseRoomMock(...args),
}))

vi.mock('firebase/app', () => ({
  initializeApp: (options: { databaseURL: string }, name: string) =>
    initializeAppMock(options, name),
  getApps: () => [],
}))

import { TrysteroTransportAdapter } from './trystero-transport'

function makeRoom() {
  const handlers = {
    onPeerJoin: (_peerId: string) => {},
    onPeerLeave: (_peerId: string) => {},
  }
  const receive = vi.fn()
  const send = vi.fn()
  return {
    makeAction: vi.fn(() => [send, receive]),
    onPeerJoin: vi.fn((handler: (peerId: string) => void) => {
      handlers.onPeerJoin = handler
    }),
    onPeerLeave: vi.fn((handler: (peerId: string) => void) => {
      handlers.onPeerLeave = handler
    }),
    getPeers: vi.fn(() => ({})),
    leave: vi.fn(async () => {}),
    handlers,
    receive,
    send,
  }
}

function mockDualRooms() {
  const torrentRoom = makeRoom()
  const nostrRoom = makeRoom()
  joinTorrentRoomMock.mockReturnValue(torrentRoom)
  joinNostrRoomMock.mockReturnValue(nostrRoom)
  return { torrentRoom, nostrRoom }
}

// openRoom awaits TURN + channel resolution before joining, so drain several
// microtask ticks to let those settle under fake timers.
async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve()
  }
}

describe('TrysteroTransportAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Disable the hardcoded Firebase default so tests opt in explicitly.
    vi.stubEnv('VITE_FIREBASE_DATABASE_URL', 'off')
    joinNostrRoomMock.mockReset()
    joinTorrentRoomMock.mockReset()
    joinFirebaseRoomMock.mockReset()
    getNostrRelaySocketsMock.mockReset()
    getTorrentRelaySocketsMock.mockReset()
    getNostrRelaySocketsMock.mockReturnValue({})
    getTorrentRelaySocketsMock.mockReturnValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('joins both torrent trackers and nostr relays with shared ICE config', async () => {
    mockDualRooms()

    const adapter = new TrysteroTransportAdapter('test-app')
    adapter.createRoom()
    await flushMicrotasks()

    expect(joinTorrentRoomMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'test-app',
        rtcConfig: { iceCandidatePoolSize: 10 },
        relayUrls: expect.arrayContaining(['wss://tracker.openwebtorrent.com']),
      }),
      expect.stringMatching(/^test-app-\d{6}$/),
      expect.any(Function),
    )
    expect(joinNostrRoomMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'test-app',
        relayUrls: expect.arrayContaining(['wss://relay.damus.io']),
      }),
      expect.stringMatching(/^test-app-\d{6}$/),
      expect.any(Function),
    )
  })

  it('prepends a Firebase signalling channel when a database URL is configured', async () => {
    vi.useRealTimers()
    mockDualRooms()
    const firebaseRoom = makeRoom()
    joinFirebaseRoomMock.mockReturnValue(firebaseRoom)

    const adapter = new TrysteroTransportAdapter(
      'test-app',
      undefined,
      'https://demo-default-rtdb.firebaseio.com',
    )
    adapter.createRoom()
    await vi.waitFor(() => expect(joinFirebaseRoomMock).toHaveBeenCalled())

    expect(joinFirebaseRoomMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'test-app',
        firebaseApp: expect.objectContaining({
          options: { databaseURL: 'https://demo-default-rtdb.firebaseio.com' },
        }),
      }),
      expect.stringMatching(/^test-app-\d{6}$/),
      expect.any(Function),
    )
    // Trackers and Nostr remain joined as redundant fallback paths.
    expect(joinTorrentRoomMock).toHaveBeenCalledTimes(1)
    expect(joinNostrRoomMock).toHaveBeenCalledTimes(1)
    adapter.disconnect()
  })

  it('retries guest connect before reporting error', async () => {
    mockDualRooms()
    mockDualRooms()
    mockDualRooms()

    const statuses: string[] = []
    const logs: string[] = []
    const adapter = new TrysteroTransportAdapter('test-app')
    adapter.setCallbacks({
      onStatusChange: (status) => statuses.push(status),
      onPeerJoin: () => {},
      onPeerLeave: () => {},
      onMessage: () => {},
      onLog: (message) => logs.push(message),
    })

    adapter.joinRoom('123456')
    await flushMicrotasks()
    expect(joinTorrentRoomMock).toHaveBeenCalledTimes(1)
    expect(joinNostrRoomMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(25_000)
    expect(joinTorrentRoomMock).toHaveBeenCalledTimes(2)
    expect(logs.some((line) => line.includes('Retrying'))).toBe(true)
    expect(statuses.at(-1)).toBe('connecting')

    await vi.advanceTimersByTimeAsync(25_000)
    expect(joinTorrentRoomMock).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(25_000)
    expect(statuses.at(-1)).toBe('error')
  })

  it('uses the first signalling channel that delivers a peer', async () => {
    const { torrentRoom } = mockDualRooms()

    const adapter = new TrysteroTransportAdapter('test-app')
    let peerJoined = false
    adapter.setCallbacks({
      onStatusChange: () => {},
      onPeerJoin: () => {
        peerJoined = true
      },
      onPeerLeave: () => {},
      onMessage: () => {},
      onLog: () => {},
    })

    adapter.joinRoom('123456')
    await flushMicrotasks()
    torrentRoom.handlers.onPeerJoin('peer-1')

    expect(peerJoined).toBe(true)
    await vi.advanceTimersByTimeAsync(75_000)
    expect(joinTorrentRoomMock).toHaveBeenCalledTimes(1)
  })

  it('keeps both channels joined and fires onPeerJoin only once', async () => {
    const { torrentRoom, nostrRoom } = mockDualRooms()

    const adapter = new TrysteroTransportAdapter('test-app')
    let joins = 0
    adapter.setCallbacks({
      onStatusChange: () => {},
      onPeerJoin: () => {
        joins += 1
      },
      onPeerLeave: () => {},
      onMessage: () => {},
      onLog: () => {},
    })

    adapter.createRoom()
    await flushMicrotasks()
    torrentRoom.handlers.onPeerJoin('peer-1')
    nostrRoom.handlers.onPeerJoin('peer-1')

    expect(joins).toBe(1)
    expect(torrentRoom.leave).not.toHaveBeenCalled()
    expect(nostrRoom.leave).not.toHaveBeenCalled()
  })

  it('delivers messages arriving on the non-active channel', async () => {
    const { torrentRoom, nostrRoom } = mockDualRooms()

    const adapter = new TrysteroTransportAdapter('test-app')
    const received: unknown[] = []
    adapter.setCallbacks({
      onStatusChange: () => {},
      onPeerJoin: () => {},
      onPeerLeave: () => {},
      onMessage: (data) => received.push(data),
      onLog: () => {},
    })

    adapter.joinRoom('123456')
    await flushMicrotasks()
    torrentRoom.handlers.onPeerJoin('peer-1')

    const nostrReceiveHandler = nostrRoom.receive.mock.calls[0]?.[0] as (
      data: unknown,
    ) => void
    nostrReceiveHandler({ move: 'e2->e4' })

    expect(received).toEqual([{ move: 'e2->e4' }])
  })

  it('fails over to the surviving channel when the active one drops', async () => {
    const { torrentRoom, nostrRoom } = mockDualRooms()

    const adapter = new TrysteroTransportAdapter('test-app')
    const statuses: string[] = []
    let leaves = 0
    adapter.setCallbacks({
      onStatusChange: (status) => statuses.push(status),
      onPeerJoin: () => {},
      onPeerLeave: () => {
        leaves += 1
      },
      onMessage: () => {},
      onLog: () => {},
    })

    adapter.joinRoom('123456')
    await flushMicrotasks()
    torrentRoom.handlers.onPeerJoin('peer-1')
    nostrRoom.handlers.onPeerJoin('peer-1')

    torrentRoom.handlers.onPeerLeave('peer-1')
    expect(leaves).toBe(0)
    expect(statuses.at(-1)).toBe('connected')

    adapter.send({ move: 'e2->e4' })
    expect(nostrRoom.send).toHaveBeenCalledWith({ move: 'e2->e4' })
    expect(torrentRoom.send).not.toHaveBeenCalled()

    nostrRoom.handlers.onPeerLeave('peer-1')
    expect(leaves).toBe(1)
    expect(statuses.at(-1)).toBe('disconnected')
  })

  it('fetches TURN credentials when a credentials URL is configured', async () => {
    mockDualRooms()
    const turnServers = [
      { urls: 'turn:relay.example.com:443', username: 'u', credential: 'c' },
    ]
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => turnServers,
    }))
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new TrysteroTransportAdapter(
      'test-app',
      'https://turn.example.com/credentials',
    )
    adapter.createRoom()
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(joinTorrentRoomMock).toHaveBeenCalledWith(
      expect.objectContaining({ turnConfig: turnServers }),
      expect.any(String),
      expect.any(Function),
    )
    vi.unstubAllGlobals()
  })

  it('derives the Metered credentials URL from VITE_METERED_API_KEY', async () => {
    mockDualRooms()
    vi.stubEnv('VITE_METERED_API_KEY', 'test-key')
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new TrysteroTransportAdapter('test-app')
    adapter.createRoom()
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://centurion.metered.live/api/v1/turn/credentials?apiKey=test-key',
      expect.anything(),
    )
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('continues STUN-only when the TURN credentials fetch fails', async () => {
    mockDualRooms()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )

    const logs: string[] = []
    const adapter = new TrysteroTransportAdapter(
      'test-app',
      'https://turn.example.com/credentials',
    )
    adapter.setCallbacks({
      onStatusChange: () => {},
      onPeerJoin: () => {},
      onPeerLeave: () => {},
      onMessage: () => {},
      onLog: (message) => logs.push(message),
    })
    adapter.createRoom()
    await vi.advanceTimersByTimeAsync(0)

    expect(joinTorrentRoomMock).toHaveBeenCalledWith(
      expect.objectContaining({ turnConfig: [] }),
      expect.any(String),
      expect.any(Function),
    )
    expect(logs.some((line) => line.includes('STUN-only'))).toBe(true)
    vi.unstubAllGlobals()
  })
})
