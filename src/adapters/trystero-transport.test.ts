import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const joinNostrRoomMock = vi.fn()
const joinTorrentRoomMock = vi.fn()
const getNostrRelaySocketsMock = vi.fn(() => ({}))
const getTorrentRelaySocketsMock = vi.fn(() => ({}))

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

describe('TrysteroTransportAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    joinNostrRoomMock.mockReset()
    joinTorrentRoomMock.mockReset()
    getNostrRelaySocketsMock.mockReset()
    getTorrentRelaySocketsMock.mockReset()
    getNostrRelaySocketsMock.mockReturnValue({})
    getTorrentRelaySocketsMock.mockReturnValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('joins both torrent trackers and nostr relays with shared ICE config', async () => {
    mockDualRooms()

    const adapter = new TrysteroTransportAdapter('test-app')
    adapter.createRoom()
    await Promise.resolve()

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
    await Promise.resolve()
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
    await Promise.resolve()
    torrentRoom.handlers.onPeerJoin('peer-1')

    expect(peerJoined).toBe(true)
    await vi.advanceTimersByTimeAsync(75_000)
    expect(joinTorrentRoomMock).toHaveBeenCalledTimes(1)
  })
})
