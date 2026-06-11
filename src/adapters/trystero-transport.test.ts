import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const joinNostrRoomMock = vi.fn()
const joinTorrentRoomMock = vi.fn()
const joinMqttRoomMock = vi.fn()
const getNostrRelaySocketsMock = vi.fn(() => ({}))
const getTorrentRelaySocketsMock = vi.fn(() => ({}))
const getMqttRelaySocketsMock = vi.fn(() => ({}))

vi.mock('trystero', () => ({
  joinRoom: (...args: unknown[]) => joinNostrRoomMock(...args),
  selfId: 'test-self-id',
}))

vi.mock('trystero/torrent', () => ({
  joinRoom: (...args: unknown[]) => joinTorrentRoomMock(...args),
  getRelaySockets: () => getTorrentRelaySocketsMock(),
}))

vi.mock('trystero/mqtt', () => ({
  joinRoom: (...args: unknown[]) => joinMqttRoomMock(...args),
  getRelaySockets: () => getMqttRelaySocketsMock(),
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

function mockAllChannels() {
  const mqttRoom = makeRoom()
  const torrentRoom = makeRoom()
  const nostrRoom = makeRoom()
  joinMqttRoomMock.mockReturnValue(mqttRoom)
  joinTorrentRoomMock.mockReturnValue(torrentRoom)
  joinNostrRoomMock.mockReturnValue(nostrRoom)
  return { mqttRoom, torrentRoom, nostrRoom }
}

describe('TrysteroTransportAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    joinNostrRoomMock.mockReset()
    joinTorrentRoomMock.mockReset()
    joinMqttRoomMock.mockReset()
    getNostrRelaySocketsMock.mockReset()
    getTorrentRelaySocketsMock.mockReset()
    getMqttRelaySocketsMock.mockReset()
    getNostrRelaySocketsMock.mockReturnValue({})
    getTorrentRelaySocketsMock.mockReturnValue({})
    getMqttRelaySocketsMock.mockReturnValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('joins MQTT, torrent, and Nostr with shared ICE config', async () => {
    mockAllChannels()

    const adapter = new TrysteroTransportAdapter('test-app')
    adapter.createRoom()
    await Promise.resolve()

    expect(joinMqttRoomMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'test-app',
        relayUrls: ['wss://broker.emqx.io:8084/mqtt'],
      }),
      expect.stringMatching(/^test-app-\d{6}$/),
      expect.any(Function),
    )
    expect(joinTorrentRoomMock).toHaveBeenCalledWith(
      expect.objectContaining({
        relayUrls: ['wss://tracker.openwebtorrent.com'],
      }),
      expect.stringMatching(/^test-app-\d{6}$/),
      expect.any(Function),
    )
    expect(joinNostrRoomMock).toHaveBeenCalled()
  })

  it('retries guest connect before reporting error', async () => {
    mockAllChannels()
    mockAllChannels()

    const statuses: string[] = []
    const adapter = new TrysteroTransportAdapter('test-app')
    adapter.setCallbacks({
      onStatusChange: (status) => statuses.push(status),
      onPeerJoin: () => {},
      onPeerLeave: () => {},
      onMessage: () => {},
      onLog: () => {},
    })

    adapter.joinRoom('123456')
    await Promise.resolve()
    expect(joinMqttRoomMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(6_000 + 35_000)
    expect(joinMqttRoomMock).toHaveBeenCalledTimes(2)
    expect(statuses.at(-1)).toBe('connecting')
  })

  it('uses the first signalling channel that delivers a peer', async () => {
    const { mqttRoom } = mockAllChannels()

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
    mqttRoom.handlers.onPeerJoin('peer-1')

    expect(peerJoined).toBe(true)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(joinMqttRoomMock).toHaveBeenCalledTimes(1)
  })
})
