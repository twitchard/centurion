/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Firebase Realtime Database URL (e.g.
   * https://<project>-default-rtdb.firebaseio.com) that hosts multiplayer
   * match rooms. Unset/empty uses the built-in default database; set to
   * `off` to disable multiplayer.
   */
  readonly VITE_FIREBASE_DATABASE_URL?: string
}

declare const __MULTIPLAYER_BUILD_ID__: string
