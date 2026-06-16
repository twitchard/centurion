/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional endpoint returning a JSON array of RTCIceServer objects with
   * TURN credentials (e.g. a Metered free-tier credentials URL). Without it
   * multiplayer is STUN-only and fails on NATs that require a relay.
   */
  readonly VITE_TURN_CREDENTIALS_URL?: string
  /**
   * Alternative to VITE_TURN_CREDENTIALS_URL: a Metered API key for the
   * "centurion" Metered app, from which the credentials URL is derived.
   */
  readonly VITE_METERED_API_KEY?: string
  /**
   * Firebase Realtime Database URL (e.g.
   * https://<project>-default-rtdb.firebaseio.com), the primary signalling
   * channel — far more reliable than the public trackers/relays, which content
   * filters often block. Unset/empty uses the built-in default database; set to
   * `off` to disable Firebase signalling.
   */
  readonly VITE_FIREBASE_DATABASE_URL?: string
}

declare const __MULTIPLAYER_BUILD_ID__: string
