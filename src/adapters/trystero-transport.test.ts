import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const joinRoomMock = vi.fn()
const getRelaySocketsMock = vi.fn(() => ({}))

vi.mock('trystero', () => ({
  joinRoom: (...args: unknown[]) => joinRoomMock(...args),
}))

vi.mock('trystero/nostr', () => ({
  getRelaySockets: () => getRelaySocketsMock(),
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
    getPeers: vi.fn(() => new Map()),
    leave: vi.fn(),
    handlers,
    receive,
    send,
  }
}

describe('TrysteroTransportAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    joinRoomMock.mockReset()
    getRelaySocketsMock.mockReset()
    getRelaySocketsMock.mockReturnValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes expanded TURN and rtcConfig to joinRoom', () => {
    const room = makeRoom()
    joinRoomMock.mockReturnValue(room)

    const adapter = new TrysteroTransportAdapter('test-app')
    adapter.createRoom()

    expect(joinRoomMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'test-app',
        rtcConfig: { iceCandidatePoolSize: 10 },
        turnConfig: expect.arrayContaining([
          expect.objectContaining({ urls: 'stun:openrelay.metered.ca:80' }),
          expect.objectContaining({
            urls: expect.arrayContaining(['turns:openrelay.metered.ca:443']),
            username: 'openrelayproject',
            credential: 'openrelayproject',
          }),
        ]),
        relayUrls: expect.arrayContaining(['wss://relay.damus.io']),
      }),
      expect.stringMatching(/^test-app-\d{6}$/),
      expect.any(Function),
    )
  })

  it('retries guest connect before reporting error', () => {
    const roomOne = makeRoom()
    const roomTwo = makeRoom()
    const roomThree = makeRoom()
    joinRoomMock
      .mockReturnValueOnce(roomOne)
      .mockReturnValueOnce(roomTwo)
      .mockReturnValueOnce(roomThree)

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
    expect(statuses).toEqual(['connecting'])
    expect(joinRoomMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(20_000)
    expect(joinRoomMock).toHaveBeenCalledTimes(2)
    expect(logs.some((line) => line.includes('Retrying'))).toBe(true)
    expect(statuses.at(-1)).toBe('connecting')

    vi.advanceTimersByTime(20_000)
    expect(joinRoomMock).toHaveBeenCalledTimes(3)
    expect(logs.some((line) => line.includes('retry 3/3'))).toBe(true)

    vi.advanceTimersByTime(20_000)
    expect(statuses.at(-1)).toBe('error')
    expect(roomThree.leave).toHaveBeenCalled()
  })

  it('clears guest timer when peer joins', () => {
    const room = makeRoom()
    joinRoomMock.mockReturnValue(room)

    const adapter = new TrysteroTransportAdapter('test-app')
    adapter.setCallbacks({
      onStatusChange: () => {},
      onPeerJoin: () => {},
      onPeerLeave: () => {},
      onMessage: () => {},
    })

    adapter.joinRoom('123456')
    room.handlers.onPeerJoin('peer-1')

    vi.advanceTimersByTime(60_000)
    expect(joinRoomMock).toHaveBeenCalledTimes(1)
  })
})
