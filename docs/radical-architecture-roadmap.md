# Radical Architecture Roadmap

Last updated: 2026-02-16

This document replaces the old incremental "top 5 improvements" approach with a full architecture reset.

## Why this exists

The app is not reliable enough in its current form. We are shifting to:

1. Maximum practical TypeScript strictness.
2. Functional core, imperative shell.
3. Invalid states made unrepresentable through discriminated unions.
4. Explicit state machines with reified transitions (Elm-style update loop).
5. Independently testable modules for rendering and multiplayer.

## Product direction (new top-level menu)

On app open, users land on a menu with three destinations:

1. **Superposition Board Lab**
   - Board rendering only.
   - Text field for multiple FEN positions (delimiter-based input).
   - Text field for arrow coordinates (delimiter-based input).
   - Output is a pure rendered superposition board.
2. **P2P Chat Lab**
   - Multiplayer text chat only.
   - No chess move sync in this mode.
   - Uses the same network layer style as production (transport isolated behind ports).
3. **Centurion Match**
   - Full integrated game mode (existing concept, rebuilt with strict typed state transitions).

## Core engineering rules (non-negotiable)

### 1) Pure update logic

State transitions must be pure and deterministic:

```ts
type UpdateResult<Model, Cmd> = readonly [Model, readonly Cmd[]]
type Update<Model, Msg, Cmd> = (model: Model, msg: Msg) => UpdateResult<Model, Cmd>
```

No random numbers, DOM access, timers, or network calls inside update functions.

### 2) Explicit state machine at app boundary

Use discriminated unions for app mode and transitions:

```ts
type AppState =
  | { tag: 'menu' }
  | { tag: 'superposition-lab'; model: SuperpositionLabModel }
  | { tag: 'chat-lab'; model: ChatModel }
  | { tag: 'centurion-match'; model: MatchModel }
```

Events (`Msg`) and effects (`Cmd`) are also discriminated unions.

### 3) Functional core, imperative ports

All side effects are interpreted by adapters/ports:
- clock/timers
- randomness
- DOM/UI IO
- network transport
- persistence

### 4) Invalid states are unrepresentable

Use tight type models for:
- connection states (`disconnected | connecting | connected`)
- parsed input (`valid | invalid` with diagnostics)
- match lifecycle (`idle | active | resolving | complete`)
- command acknowledgements

### 5) Module boundaries are strict

- `core/*`: pure domain + reducers + codecs + parsing
- `ports/*`: effect interfaces
- `adapters/*`: concrete browser/trystero implementations
- `features/superposition-lab/*`
- `features/chat-lab/*`
- `features/centurion-match/*`
- `app/*`: top-level composition and routing state machine

## TypeScript strictness baseline (target profile)

`tsconfig` should enforce:

- `"strict": true`
- `"exactOptionalPropertyTypes": true`
- `"noUncheckedIndexedAccess": true`
- `"noImplicitReturns": true`
- `"noImplicitOverride": true`
- `"noPropertyAccessFromIndexSignature": true`
- `"forceConsistentCasingInFileNames": true`
- `"useUnknownInCatchVariables": true`
- `"isolatedModules": true`

And process changes should include:
- dedicated `typecheck` script (`tsc --noEmit`)
- CI gate: typecheck + test + lint must pass

## Exploratory library research (shortlist)

Versions below were checked on 2026-02-16 via npm.

| Concern | Candidate | Version | Notes | Recommendation |
| --- | --- | --- | --- | --- |
| State machine runtime | `xstate` | `5.28.0` | Strong statechart model, tooling, larger surface area | Consider for orchestration/visualization, but avoid over-coupling core domain to framework runtime |
| Lightweight FSM | `robot3` | `1.2.0` | Tiny and simple, less ecosystem/tooling | Good for small feature state machines |
| Functional effect system | `effect` | `3.19.17` | Powerful typed effects; steeper learning curve | Evaluate after app state machine baseline stabilizes |
| FP utility library | `fp-ts` | `2.16.11` | Mature functional abstractions, verbose ergonomics | Optional; avoid forced adoption if it hurts readability |
| Chess rules/model | `chessops` | `0.15.0` | Rules-focused, typed chess operations | Best candidate for pure chess domain ops |
| Chess rules/model | `chess.js` | `1.4.0` | Popular and easy, mutable/OO style | Useful fallback, less aligned with pure functional direction |
| Board UI | `@lichess-org/chessground` | `10.0.2` | Great standard board interactions | Not ideal for superposition rendering; custom canvas likely required |
| P2P transport | `trystero` | `0.22.0` | Serverless WebRTC matchmaking, already in project | Keep, but isolate behind typed transport port |

### Research conclusion

- Keep **custom board rendering** for superposition experiments.
- Keep **Trystero** for P2P transport, but move it behind a strict typed adapter.
- Start with **Elm-style typed update + commands** in first-party code.
- Evaluate **XState** only where statechart tooling gives clear benefits.
- Prefer **chessops** for pure chess domain operations during refactor.

## Medium-sized project backlog (new source of truth)

Status legend: `[ ]` not started, `[~]` in progress, `[x]` complete.

### Project 1 - Strict TypeScript hardening
- [ ] Add strictness options listed above and fix all resulting type errors.
- [ ] Remove unchecked casts in DOM/network boundaries using typed decoders.
- [ ] Add `npm run typecheck` and enforce in CI.
- Exit criteria: zero TypeScript errors under strict profile, deterministic CI gate.

### Project 2 - App shell state machine (Elm architecture)
- [ ] Introduce top-level `AppState`, `AppMsg`, `AppCmd`.
- [ ] Build pure `updateApp(state, msg)` reducer.
- [ ] Build command interpreter for side effects.
- Exit criteria: every screen transition goes through typed messages and reducers.

### Project 3 - Superposition Board Core (pure domain)
- [ ] Define pure types for board layers, overlays, and opacity blending.
- [ ] Build deterministic parser for delimiter-separated FEN input.
- [ ] Build deterministic parser for delimiter-separated arrow input.
- Exit criteria: board composition testable without DOM or canvas.

### Project 4 - Superposition Board Renderer module
- [ ] Isolate rendering pipeline into independent module (`render-superposition`).
- [ ] Define renderer input contract independent of game/network state.
- [ ] Add screenshot/fixture-style rendering assertions.
- Exit criteria: renderer can be run with static fixtures and no app bootstrapping.

### Project 5 - Superposition Lab feature (menu destination #1)
- [ ] Build lab UI around pure parser + renderer module.
- [ ] Show parse diagnostics inline for invalid FEN/arrow inputs.
- [ ] Keep all user edits represented in typed model (no hidden mutable globals).
- Exit criteria: manual and automated tests for input->render flow.

### Project 6 - P2P Chat Lab feature (menu destination #2)
- [ ] Build isolated chat state machine (`ChatState`, `ChatMsg`, `ChatCmd`).
- [ ] Reuse transport adapter with strict typed message codecs.
- [ ] Add reconnect/error states as explicit union members.
- Exit criteria: chat works independently from chess logic, with deterministic reducer tests.

### Project 7 - Match domain rewrite (menu destination #3)
- [ ] Re-model match lifecycle as explicit union states.
- [ ] Reify arrow resolution as pure transitions + effectful command execution.
- [ ] Make randomness/timing injectable via ports for repeatable tests.
- Exit criteria: deterministic simulation tests for resolution and scoring.

### Project 8 - Integration and routing
- [ ] Replace current startup with new three-option menu.
- [ ] Keep each destination bootstrapped independently.
- [ ] Add integration tests for menu navigation and module isolation.
- Exit criteria: each feature can start, run, and fail independently without cascading breakage.

### Project 9 - Test architecture upgrade (manual + automated)
- [ ] Unit tests for pure reducers/parsers.
- [ ] Model-based tests for state-machine transitions.
- [ ] Integration tests for adapters (network, DOM, timers).
- [ ] Manual test scripts/checklists for each menu destination.
- Exit criteria: release confidence from both deterministic automation and explicit manual protocol.

### Project 10 - Legacy cleanup and migration completion
- [ ] Remove old imperative wiring once replacement paths are stable.
- [ ] Publish migration notes and architecture diagrams.
- [ ] Freeze unstable APIs behind typed boundaries.
- Exit criteria: old flow removed, new architecture documented and enforced.

## Immediate next steps (first iteration)

1. Land strict typecheck gate and config hardening.
2. Introduce top-level app state machine shell (`menu` + route transitions only).
3. Extract current renderer input/output contract into a standalone module.
4. Build a minimal Superposition Lab from static fixtures before wiring live match state.
