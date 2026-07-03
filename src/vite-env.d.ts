/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Firebase Realtime Database URL (e.g.
   * https://<project>-default-rtdb.firebaseio.com) that hosts multiplayer
   * match rooms. Unset/empty uses the built-in default database; set to
   * `off` to disable multiplayer.
   */
  readonly VITE_FIREBASE_DATABASE_URL?: string

  /**
   * URL of the command compile endpoint (api/compile.ts deployed on
   * Vercel or the local `bun run command:server`). Unset defaults to
   * http://localhost:8787/api/compile in dev and /api/compile in builds.
   */
  readonly VITE_COMMAND_COMPILER_URL?: string
}

declare const __MULTIPLAYER_BUILD_ID__: string
