# Centurion Chess

Two players compete across 100 simultaneous games of chess. One player is white in every game and the other is black; which player gets which color is chosen at random when the match starts. You view a single shared board displaying a superposition of all active games — and you steer them by **issuing orders in plain English**.

Each game is fought by your **soldier**: a deliberately imperfect engine. Unled, a soldier plays a mediocre move — Stockfish ranks every legal move and the soldier samples one aiming about a pawn (100cp) below the best, so the hundred identical openings drift apart on their own. On your turn you may type a command of at most **40 characters** ("e4", "all knights advance", "take the queen"). Literal chess notation compiles directly to a move predicate; other phrases go through a language model. The app echoes back what it means in plain English plus how many games it currently touches, and once you issue it, every game with a matching legal move restricts its soldier to the moves you allowed — same imperfect judgment, better options. Your command's value is exactly how much your chess idea improves on unled mediocrity.

**The full match is playable**: solo against the drift, pass-and-play on one device, or online multiplayer with a 6-digit match code.

## Playing

Run `bun install` then `bun run dev` and open the app. The game needs a compile endpoint for commands: run `ANTHROPIC_API_KEY=sk-... bun run command:server` alongside the dev server (the app calls `http://localhost:8787/api/compile` in dev), or point `VITE_COMMAND_COMPILER_URL` at a deployed endpoint.

- **/** — Centurion Chess. Solo starts immediately; Pass & Play alternates the command box between players; New Multiplayer Match creates a 6-digit room code, and Join with code connects to it.
- **/labs** — developer labs: the Superposition Board Lab (render arbitrary FEN/arrow sets) and the Command Compiler Lab (see below).

The turn loop: type an order, **Compile** it, read the echo ("a move by a knight and that advances — matches in 87 of 100 games"), then **Issue order** — or **Pass** to let the soldiers play unled. In solo mode you command white every turn and black's soldiers play unled; in versus modes you and your opponent alternate.

## The command compiler

Commands compile to a **move predicate**: a small JSON term over properties a single move can have (moving piece, from/to region, captures, gives check, castles, promotes, advances/retreats, attacks a role, escapes attack, plus and/or/not). Applying a predicate to a game's legal moves is pure and deterministic, so the compiled term is what enters match state and both peers replay it identically; the LLM's nondeterminism stays quarantined at the compile step. Ranks in a predicate are counted from the mover's side and files are absolute, so one predicate means the same positional idea in 100 divergent games.

The pieces:

- `src/core/command/` — the predicate model, the codec that validates untrusted LLM/wire JSON, the evaluator (chessops), the deterministic English "reads as" renderer, and the compile prompt.
- `api/compile.ts` — a Vercel Edge function exposing `POST /api/compile` with `{command: string}`. Deploy by connecting the repo to a Vercel project and setting `ANTHROPIC_API_KEY` (and optionally `COMMAND_COMPILE_MODEL`; the default is `claude-opus-4-8` — a compile is a few hundred cached tokens, a fraction of a cent) as environment variables. The character limit, forced tool output, and small `max_tokens` bound the endpoint's abuse surface; the key never ships to clients.
- `bun run command:server` — the same endpoint served locally by Bun on port 8787 for development.
- **Command Compiler Lab** at `/labs` — type a command, compile it against any endpoint, and see the predicate, its English reading, and the matching moves for a list of FEN positions.
- `bun run command:eval` — a phrase battery run against the live API; use it to judge whether a cheaper model is good enough before changing `COMMAND_COMPILE_MODEL`.

## Multiplayer

Multiplayer syncs match state through **Firebase Realtime Database** — no WebRTC, no NAT traversal, no peer-to-peer connection. A match room is a small database record: the match seed, a presence flag per player, and the latest match snapshot. The host creates a room and shares the 6-digit code; when the guest joins, the host publishes the initial snapshot, and from then on whoever resolves a turn publishes the new state while the other player's client mirrors it. Because the room always holds the full authoritative snapshot, the two clients cannot diverge, and either player can reload or reconnect mid-match and pick up exactly where the room says the match is.

By default the app uses its own built-in free Firebase database, so multiplayer works out of the box. The database URL is not a secret — like any client config it ships in the bundle, and the database [rules](https://firebase.google.com/docs/database/security) gate access: only the `__trystero__` subtree is writable (the name is a relic of an earlier design, kept so existing databases need no rules change), rooms live under `__trystero__/centurion-rooms/<code>`, and they hold nothing but ephemeral match state.

To point at your own Firebase database instead:

1. Create a free Firebase project at [console.firebase.google.com](https://console.firebase.google.com) and add a **Realtime Database** (any region).
2. In the database's **Rules**, allow read/write under the room subtree:
   ```json
   { "rules": { "__trystero__": { ".read": true, ".write": true } } }
   ```
3. Set the build variable `VITE_FIREBASE_DATABASE_URL` to your database URL (e.g. `https://your-project-default-rtdb.firebaseio.com`) — a GitHub repository secret of that name for the Pages deploy, or `VITE_FIREBASE_DATABASE_URL=… bun run dev` locally. Unset/empty keeps the built-in default; set it to `off` to disable multiplayer. The Firebase SDK is loaded only when multiplayer is actually used.

## Gameplay rules (implemented)

### Board and display

The board is displayed from your perspective: your pieces are always closest to you. The player who owns black sees the board rank-flipped so their pieces sit at the bottom, and ranks in commands always count from your own side.

Pieces from all active games are rendered on a single board with opacity proportional to how many games contain that piece on that square, producing a ghostly superposition. Precise orders visibly re-correlate the swarm; unled turns let it drift.

Each resolved turn replays as a ~2 second animation: pieces that followed your order slide to their destination first with a glow, then every freely-moved piece fades across in a stagger. The animation is purely presentational (state is already final underneath) and is skipped when the system requests reduced motion.

### Turns

Players alternate turns; each turn resolves one half-move in every active game. Who plays white is chosen from the match seed; the white owner issues the first command. On your turn you may issue at most one command (compile, preview, then issue) or pass. Commands are only accepted through turn 100; after that the soldiers play the match out unled.

### Resolution

When a turn is issued, every active game advances one half-move:

1. **Rank.** Stockfish (depth 5, full MultiPV, single-threaded WASM in a web worker) ranks every legal move of the position with a centipawn score, mates mapped above/below all real scores. Identical positions share one search.
2. **Constrain.** If a command was issued, the game's allowed moves are those matching the predicate; if none match (or no command was issued), all legal moves are allowed. Predicates are evaluated mover-relative, so no board flipping is involved.
3. **Sample.** The soldier picks among the allowed moves with weight `exp(-|cp - (best - 100)| / 60)` — aiming a set centipawn distance below the position's best move — using the match's seeded RNG. A soldier that can see a forced mate plays the top move instead, command or not. Castling and en passant follow standard rules; promotions come from the engine's ranked list.

The sampling is per-game, so identical positions still diverge; the constants (`SOLDIER_TARGET_CP = 100`, `SOLDIER_TEMP_CP = 60`) live in `src/core/match/model.ts` and are the game's difficulty dial.

### Scoring

When a game ends in checkmate, the player whose side delivered checkmate scores one point. The game is then removed from the active set.

Games that end in a draw (stalemate, threefold repetition, fifty-move rule, or insufficient material) award no points to either player and are removed from the active set.

### Match end

The match ends when one player's score exceeds the other's by more than the number of currently active games (the trailing player cannot catch up even by winning every remaining game).

If all 100 games conclude and both players have equal scores, the match is a draw.

## Architecture

The app follows a strict Elm-style architecture under maximum practical TypeScript strictness — see **[docs/radical-architecture-roadmap.md](./docs/radical-architecture-roadmap.md)** for the principles and current status.

- `src/core/` — pure domain logic: chess rules ([chessops](https://github.com/niklasf/chessops)), the command predicate DSL (`core/command`), match state and soldier resolution (`core/match`), seeded RNG, parsers, codecs. Everything deterministic and testable without a browser.
- `src/features/` — feature reducers (`centurion-match`, `command-lab`, `superposition-lab`) plus the canvas superposition renderer.
- `src/ports/` + `src/adapters/` — effect interfaces and their implementations: the Firebase match room, Stockfish (WASM in a web worker, speaking UCI), and the command compiler endpoint.
- `src/app/` + `src/main.ts` — top-level state machine and the imperative shell that interprets commands.

Each turn resolves in three steps: the LLM compiles words to a predicate once (async, at the edge); Stockfish ranks every distinct position (async, in the worker); and the soldier sampling is pure and deterministic, driven by a seeded RNG. The resolving client publishes the settled snapshot, so engine and sampling nondeterminism never has to agree across peers.

Multiplayer is shared state, not a message protocol: the player who resolves a turn publishes the full match snapshot to the room, and the opponent adopts it verbatim. That trades a little bandwidth for the entire class of out-of-sync bugs — there is nothing to replay and nothing to disagree about.

## CI checks (local mirror)

The GitHub Actions workflow runs the following validation checks on PRs:

1. `bun run check`
2. `bun run typecheck`
3. `bun run test`
4. `bun run build`

You can run the same sequence locally with one Bun task:

```bash
bun run ci:all
```

See [`AGENTS.md`](./AGENTS.md) for agent-focused workflow notes (Cursor + Claude Code Web).
