export type RoomRole = 'host' | 'guest'

export interface MatchRoomCallbacks {
  /** The room is open: record ensured (host) or found (guest), listeners attached. */
  readonly onOpened: () => void
  /** The room could not be opened or a write failed. `message` is user-facing copy. */
  readonly onError: (message: string) => void
  /** The other player's presence flag changed. */
  readonly onPeerPresence: (present: boolean) => void
  /** The shared match state changed. `state` is the decoded JSON snapshot, unvalidated. */
  readonly onState: (state: unknown) => void
  readonly onLog?: (message: string) => void
}

/**
 * A shared match room. The room holds the authoritative match snapshot:
 * whoever resolves a turn publishes the new state, and both players
 * adopt whatever the room says. There is no peer-to-peer connection and
 * no message protocol - just shared state.
 */
export interface MatchRoomPort {
  /**
   * Open the room `code` as `role`. Hosts creating (or re-hosting) a room
   * pass `seed` so the room record can be (re)written; guests require the
   * room to already exist.
   */
  open(code: string, role: RoomRole, seed?: number): void
  /** Publish a match snapshot as the room's authoritative state. */
  publishState(state: unknown): void
  leave(): void
  setCallbacks(callbacks: MatchRoomCallbacks): void
}

export const NOOP_MATCH_ROOM_CALLBACKS: MatchRoomCallbacks = {
  onOpened: () => {},
  onError: () => {},
  onPeerPresence: () => {},
  onState: () => {},
}
