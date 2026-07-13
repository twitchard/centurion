# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Centurion Chess: two players fight 100 simultaneous chess games rendered as one superposed board, steering deliberately imperfect Stockfish-driven "soldiers" with ≤40-character plain-English commands that an LLM compiles into move predicates. See README.md for the full game rules and product description.

## Package manager: Bun (required)

Use `bun install` and `bun run <script>` — never npm or npx. If Bun is unavailable, report it as a blocker instead of switching package managers.

## Commands

```bash
bun run ci:all        # check + typecheck + test + build — exact mirror of CI; run before finishing any change
bun run check         # biome lint+format check on src/ and api/
bun run fix           # biome auto-fix
bun run typecheck     # tsc --noEmit across all three tsconfig projects (browser, cli, api)
bun run test          # vitest run (all tests)
bunx vitest run src/core/match/resolve.test.ts   # single test file
bunx vitest run -t 'name'                        # filter by test name
bun run dev           # Vite dev server (game at /, developer labs at /labs)
bun run build         # production build to dist/
```

Developer CLI tools (Bun scripts under `src/cli/`):

```bash
ANTHROPIC_API_KEY=sk-... bun run command:server  # local compile endpoint on :8787 (dev stand-in for the Vercel function)
bun run command:eval    # phrase battery vs live API — judge compile quality before changing COMMAND_COMPILE_MODEL
bun run command:log     # print the shared Firebase command log (--json, --limit 0, --clear)
bun run board:cli       # render a superposition board in the terminal
bun run screenshot      # Playwright walk of every screen
```

In Claude Code on the web, the SessionStart hook already installs deps and runs the dev server on http://localhost:5173. The `verify` skill (`.claude/skills/verify/SKILL.md`) documents how to drive the app in a browser — use it when verifying changes at the real UI.

## Environment variables

- `ANTHROPIC_API_KEY` — required by `command:server` / the deployed `api/compile.ts` (never shipped to clients).
- `VITE_COMMAND_COMPILER_URL` — compile endpoint for the built app (dev default: `http://localhost:8787/api/compile`).
- `VITE_FIREBASE_DATABASE_URL` — multiplayer database (empty = built-in default, `off` = disable multiplayer).
- `VITE_COMMAND_LOG=off` — disable command logging without touching multiplayer.
- `COMMAND_COMPILE_MODEL` — compile model override (default `claude-opus-4-8`).

## Architecture

Strict Elm-style: functional core, imperative shell. `docs/radical-architecture-roadmap.md` holds the principles and backlog.

- `src/core/` — pure domain logic, no DOM/network/timers/randomness (randomness enters only via the seeded RNG in `src/core/rng.ts`, threaded through match state). Chess rules via chessops.
  - `core/command/` — the command predicate DSL: model, codec that validates untrusted LLM/wire JSON (`decode.ts`), evaluator (`evaluate.ts`), deterministic English renderer (`describe.ts`), literal-notation parser (`parse-notation.ts`), and the LLM compile prompt (`prompt.ts`).
  - `core/match/` — match state (`model.ts`, including the difficulty constants `SOLDIER_TARGET_CP` / `SOLDIER_TEMP_CP`), turn resolution (`resolve.ts`), snapshots, scoring, PGN, animation planning.
  - `core/superposition/` — FEN/arrow list parsers and the render model for the superposed board.
- `src/ports/` — effect interfaces (engine, match-room, command-compiler, command-log).
- `src/adapters/` — their implementations: Firebase match room + command log, Stockfish (WASM in a web worker, UCI), HTTP command compiler, localStorage persistence.
- `src/features/` — feature reducers (`centurion-match`, `command-lab`, `superposition-lab`), each with a typed model and pure `update` returning `[Model, Cmd[]]`.
- `src/app/` + `src/main.ts` — top-level `AppState`/`AppMsg`/`AppCmd` state machine and the single imperative shell that interprets commands and touches the DOM.
- `api/` — Vercel Edge functions (`POST /api/compile`), the only server-side code.
- `src/server/` — compile logic shared between the Vercel function and the local Bun server.

Key invariants that span multiple files:

- **Determinism quarantine**: LLM output becomes a validated predicate JSON term; predicate evaluation and soldier sampling are pure and seeded, so both multiplayer peers replay identically. Nondeterminism lives only at the compile step and in Stockfish, and the resolving client publishes the settled snapshot.
- **Multiplayer is shared state, not a protocol**: whoever resolves a turn publishes the full match snapshot to the Firebase room; the opponent adopts it verbatim. There is no message replay to keep in sync.
- **Untrusted data goes through codecs**: the Firebase room subtree and command log are world-writable, and LLM output is arbitrary — everything read from them is validated by decoding codecs before entering typed state.
- **Predicates are mover-relative**: natural-language ranks count from the mover's side (files absolute); literal notation uses standard square names.

Three tsconfig projects share `tsconfig.json`'s maximum-strictness profile (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, etc. — do not weaken it): browser `src/` (excludes `src/cli`), Bun `src/cli/`, and Node/Edge `api/`.

## Conventions

- Tests are colocated `*.test.ts` files run by Vitest; pure core/reducer code is expected to be testable without a browser.
- Biome enforces style: single quotes, semicolons as-needed, 2-space indent. Run `bun run fix` rather than hand-formatting.
- **No temporary stopgaps in committed code** (see AGENTS.md): no placeholder state shapes, throw-only plumbing, TODO/FIXME deferrals in production paths, or interim UI copy. If blocked, document the blocker and stop rather than shipping scaffolding.
- `src/main.ts` throws at import time if an expected element id is missing from `index.html` — a blank page usually means an id mismatch.
- Playwright in this environment must use the preinstalled browser (`executablePath: '/opt/pw-browsers/chromium'`); never run `playwright install`.

## CI and deployment

`.github/workflows/deploy.yml` runs `check`, `typecheck`, `test`, `build` on PRs (exactly `bun run ci:all`) and deploys `dist/` to GitHub Pages on pushes to `main`. The compile endpoint deploys separately via Vercel (`api/compile.ts` + `vercel.json`).
