# Top 5 Code Improvements

## 1. CI pipeline skips tests and linting

The GitHub Actions workflow (`deploy.yml`) runs `bun run build` but never
runs `bun run test` or `bun run check`. This means broken tests and lint
violations can be merged and deployed without any signal.

**What to change:** Add test and check steps before the build step:

```yaml
- name: Check
  run: bun run check

- name: Test
  run: bun run test
```

**Why it matters:** This is the single highest-leverage change. The project
already has 1,400+ lines of tests and a configured Biome linter — they just
aren't enforced. Without this gate, every other quality investment (tests,
types, lint rules) can silently regress.

---

## 2. `main.ts` wiring is untestable

All module initialization, event binding, and inter-module wiring lives in
`main.ts` as top-level imperative code with module-scoped mutable state
(`let boardRenderer`, `let overlayRenderer`) and hardcoded DOM lookups by
string ID (`document.getElementById('btn-pass-play')`). None of this code
can be exercised in the existing test suite.

This is the largest untested surface area in the project — it's where
networking, state, rendering, and UI are all stitched together, and it's
where integration bugs are most likely to hide.

**What to change:** Extract an `App` class (or a plain `createApp()` factory
function) that accepts its dependencies — the DOM container, the
`MatchState`, the `PeerConnection`, and the renderers — as constructor
parameters. Move `bindEvents`, `initCanvas`, `resize`, `render`, and the
click/touch handlers into that class. The module's top-level code becomes a
single call:

```ts
// main.ts
createApp(document.getElementById('app')!)
```

**Why it matters:** The wiring layer is where state, networking, and
rendering meet. Making it injectable means integration-level tests can
verify that "clicking a square triggers an arrow placement and a network
send" without needing a real DOM or real WebRTC. It also eliminates the
module-level `let` variables that make the current code hard to reason
about.

---

## 3. Duplicated logic in `MatchState`

Two pieces of logic are copy-pasted within `match.ts`:

**Arrow stacking** — identical loop in `placeArrow()` (lines 122-128) and
`receiveArrow()` (lines 163-170):

```ts
let stacked = false
for (const a of this.arrows) {
  if (a.fc === fc && a.fr === fr && a.tc === tc && a.tr === tr) {
    a.stack++
    stacked = true
    break
  }
}
if (!stacked) {
  this.arrows.push({ fc, fr, tc, tr, player: this.currentPlayer, stack: 1 })
}
```

**Score updating** — identical block in `resolve()` (lines 248-255) and
`applyResolution()` (lines 284-292):

```ts
for (let gi = 0; gi < NUM_GAMES; gi++) {
  const g = this.games[gi]
  if (g.result && !g.scored) {
    g.scored = true
    if (g.result === 1) this.scores[gi < 50 ? 0 : 1]++
    else if (g.result === -1) this.scores[gi < 50 ? 1 : 0]++
  }
}
```

**What to change:** Extract `private addArrow(fc, fr, tc, tr)` and
`private updateScores()` methods and call them from both sites.

**Why it matters:** These aren't one-liners — they encode game rules
(stacking semantics, score assignment by game index). If the scoring rule
changes (e.g. draws awarding half points), two locations must be updated in
lockstep. Extracting them removes that risk and makes the resolution flow
in both `resolve()` and `applyResolution()` easier to follow.

---

## 4. `makeMove` mutates the Move object with undeclared fields

`Game.makeMove()` stashes undo information directly onto the `Move` object
via dynamically-assigned underscore-prefixed fields (`_captured`,
`_castling`, `_ep`, `_halfmove`, `_promoted`, `_epCapture`). These fields
are not declared in the `Move` interface in `types.ts`, so TypeScript
doesn't know they exist — the code works only because `noNonNullAssertion`
is disabled in Biome and the fields are accessed with `!` in `undoMove()`.

This pattern creates three problems:
- The `Move` type is a lie — a fresh `Move` and a post-`makeMove` `Move`
  have different shapes, but the type system treats them identically.
- `undoMove` silently relies on invisible state that nothing enforces.
- Callers can't tell from the signature that `makeMove` mutates its
  argument.

**What to change:** Have `makeMove` return an `UndoInfo` object and change
`undoMove` to accept it:

```ts
interface UndoInfo {
  move: Move
  captured: number
  castling: number
  ep: number
  halfmove: number
  promoted: boolean
  epCapture: number
}

makeMove(m: Move): UndoInfo { ... }
undoMove(info: UndoInfo): void { ... }
```

**Why it matters:** This makes the type system accurate, makes the
make/undo contract explicit, and removes the need for the blanket
`noNonNullAssertion` Biome override — which currently suppresses
legitimate warnings elsewhere too.

---

## 5. Shared constants are duplicated or hardcoded

`NUM_GAMES` is defined independently as `100` in both `match.ts:13` and
`board.ts:11`. The engine search depth is hardcoded as `3` inside
`resolve()` at `match.ts:237`. The resolution delay is a magic `16` at
`match.ts:33`.

**What to change:** Create a single `src/constants.ts` (or extend
`src/engine/constants.ts`) exporting shared values:

```ts
export const NUM_GAMES = 100
export const ENGINE_DEPTH = 3
export const RESOLVE_DELAY_MS = 16
```

Import from that one location in both `match.ts` and `board.ts`.

**Why it matters:** Duplicated constants are a classic source of subtle
bugs — if someone changes `NUM_GAMES` in one file but not the other, the
rendering and game logic will silently disagree about how many games exist.
A single source of truth eliminates the risk and makes tuning (e.g.
experimenting with 50 games or depth 4) a one-line change.
