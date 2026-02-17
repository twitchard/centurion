import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TransportCallbacks, TransportStatus } from '../ports/transport'
import { TrysteroTransportAdapter } from './trystero-transport'

interface MockRoom {
  makeAction: (
    namespace: string,
  ) => [
    (data: unknown, targetPeers?: readonly string[]) => void,
    (receiver: (data: unknown) => void) => void,
  ]
  onPeerJoin: (callback: (peerId: string) => void) => void
  onPeerLeave: (callback: (peerId: string) => void) => void
  leave: () => void
  getPeers: () => Record<string, RTCPeerConnection>
}

interface RoomHarness {
  readonly room: MockRoom
  setPeerSilently(peerId: string): void
}

const { mockJoinRoom } = vi.hoisted(() => ({
  mockJoinRoom: vi.fn(),
}))

vi.mock('trystero/nostr', () => ({
  joinRoom: mockJoinRoom,
}))

function createCallbacks(statuses: TransportStatus[]): TransportCallbacks {
  return {
    onStatusChange: (status) => {
      statuses.push(status)
    },
    onPeerJoin: () => {
      return
    },
    onPeerLeave: () => {
      return
    },
    onMessage: () => {
      return
    },
  }
}

function createRoomHarness(): RoomHarness {
  const peers: Record<string, RTCPeerConnection> = {}

  const room: MockRoom = {
    makeAction: (namespace) => {
      void namespace
      return [
        (data, targetPeers) => {
          void data
          void targetPeers
        },
        (receiver) => {
          void receiver
        },
      ]
    },
    onPeerJoin: (callback) => {
      void callback
    },
    onPeerLeave: (callback) => {
      void callback
    },
    leave: () => {
      return
    },
    getPeers: () => peers,
  }

  return {
    room,
    setPeerSilently: (peerId) => {
      peers[peerId] = {} as RTCPeerConnection
    },
  }
}

describe('TrysteroTransportAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockJoinRoom.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('times out guest joins that never discover a peer', () => {
    const harness = createRoomHarness()
    mockJoinRoom.mockReturnValue(harness.room)

    const adapter = new TrysteroTransportAdapter('test-app', 1_000)
    const statuses: TransportStatus[] = []
    adapter.setCallbacks(createCallbacks(statuses))

    adapter.joinRoom('123456')

    expect(statuses).toEqual(['connecting'])
    vi.advanceTimersByTime(1_001)
    expect(statuses).toEqual(['connecting', 'error'])
  })

  it('promotes guest joins to connected when peers appear in room', () => {
    const harness = createRoomHarness()
    mockJoinRoom.mockReturnValue(harness.room)

    const adapter = new TrysteroTransportAdapter('test-app', 5_000)
    const statuses: TransportStatus[] = []
    adapter.setCallbacks(createCallbacks(statuses))

    adapter.joinRoom('123456')
    harness.setPeerSilently('peer-1')
    vi.advanceTimersByTime(PEER_POLL_INTERVAL_MS_FOR_TEST)

    expect(statuses).toEqual(['connecting', 'connected'])
  })
})

const PEER_POLL_INTERVAL_MS_FOR_TEST = 750
