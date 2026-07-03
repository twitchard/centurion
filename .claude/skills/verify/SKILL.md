---
name: verify
description: How to build, launch, and drive this app to verify changes at its real surface (browser UI, compile endpoint).
---

# Verifying Centurion Chess changes

## Launch

- Dev server: `bun run dev` (in Claude Code on the web it is already
  running on http://localhost:5173 via the SessionStart hook).
- Command compile endpoint (local stand-in for the Vercel function):
  `ANTHROPIC_API_KEY=sk-... bun run command:server` → POST
  http://localhost:8787/api/compile. Without a key it serves 503s,
  which is itself a testable path.
- No key available? Stand up a stub that answers with a canned
  `{predicate, description}` JSON + CORS headers and point the lab's
  endpoint input at it — the whole client flow is then drivable.

## Drive

- Playwright with the preinstalled browser:
  `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`
  (do NOT `playwright install`).
- Routes: `/` game, `/labs` labs menu. Screens are toggled `<section>`s
  in one page; navigate by clicking the menu buttons
  (`#labs-menu-open-superposition`, `#labs-menu-open-command`, ...).
- Command lab flow: fill `#command-endpoint-input`, `#command-input`,
  click `#command-compile-btn`, read `#command-diagnostics`,
  `#command-description`, `#command-predicate`, `#command-matches`.

## Gotchas

- `main.ts` throws at import time if any element id it expects is
  missing — a blank page usually means an id mismatch with index.html.
- The stockfish WASM is large; first load of the game screen is slow.
  The labs screens don't need it.
