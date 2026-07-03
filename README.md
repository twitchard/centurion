# Centurion Chess

Two players compete across 100 simultaneous games of chess. One player is white in every game and the other is black; which player gets which color is chosen at random when the match starts. You view a single shared board displaying a superposition of all active games, and influence them by placing persistent arrows.

**The full match is playable**: pass-and-play on one device, or online multiplayer with a 6-digit match code.

## Playing

Run `bun install` then `bun run dev` and open the app.

- **/** — Centurion Chess. Pass & Play starts a hot-seat match immediately; New Multiplayer Match creates a 6-digit room code, and Join with code connects to it.
- **/labs** — developer labs: the Superposition Board Lab (render arbitrary FEN/arrow sets) and the Command Compiler Lab (see below).

Solo mode pits you against the computer: you own white and place an arrow each turn, both half-moves play out with Stockfish filling the gaps, and after each black reply the computer answers with a **trap arrow** — the move Stockfish ranks *worst* (full-MultiPV, lowest line) in a plurality of your games. The trap is a white move, so it pulls nothing on the computer's own half-turn; it lies in wait on your reply, dragging up to its full weight in games into the blunder. Your newer arrow always pulls first, so each turn is a race: save the games you can, and stack or out-place the traps you can't defuse.

Place an arrow by clicking its origin and destination squares on the board (or typing notation like `e2->e4`). Each player sees the board from their own perspective; player 2's view is rank-flipped, so the same visual arrow means the same positional idea for both sides.

## Natural-language commands (experimental)

An in-progress alternative to square-anchored arrows: the player types a chess idea in plain language — at most **20 words** — and an LLM compiles it into a **move predicate**, a small JSON term over properties a single move can have (moving piece, from/to region, captures, gives check, castles, promotes, advances/retreats, attacks a role, escapes attack, plus and/or/not). Applying a predicate to a game's legal moves is pure and deterministic, so the compiled term is what would enter match state and both peers replay it identically; the LLM's nondeterminism stays quarantined at the compile step. Ranks in a predicate are counted from the mover's side and files are absolute, so one predicate means the same positional idea in 100 divergent games.

Nothing is wired into match resolution yet. What exists today:

- `src/core/command/` — the predicate model, the codec that validates untrusted LLM/wire JSON, the evaluator (chessops), the deterministic English "reads as" renderer, and the compile prompt.
- `api/compile.ts` — a Vercel serverless function exposing `POST /api/compile` with `{command: string}`. Deploy by connecting the repo to a Vercel project and setting `ANTHROPIC_API_KEY` (and optionally `COMMAND_COMPILE_MODEL`; the default is `claude-opus-4-8` — a compile is a few hundred cached tokens, a fraction of a cent) as environment variables. The word limit, forced tool output, and small `max_tokens` bound the endpoint's abuse surface; the key never ships to clients.
- `bun run command:server` — the same endpoint served locally by Bun on port 8787 for development (`ANTHROPIC_API_KEY=sk-... bun run command:server`).
- **Command Compiler Lab** at `/labs` — type a command, compile it against any endpoint (defaults to the local server in dev, `/api/compile` in builds, `VITE_COMMAND_COMPILER_URL` overrides), and see the predicate, its English reading, and the matching moves for a list of FEN positions.
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

The board is displayed from your perspective: your pieces are always closest to you. The player who owns black sees the board rank-flipped so their pieces sit at the bottom, matching the white owner's view of the starting position.

Pieces from all active games are rendered on a single board with opacity proportional to how many games contain that piece on that square, producing a ghostly superposition. No other game state information is visible — you cannot see individual game positions or which games matched which arrows.

Each resolved turn replays as a ~2 second animation: pieces pulled by arrows slide to their destination first with a gold glow, then every engine-moved piece fades out of its origin and back in at its destination in a stagger. The animation is purely presentational (state is already final underneath) and is skipped when the system requests reduced motion.

### Turns

Players alternate turns. Who plays white is chosen from the match seed at the start of the match; the white owner also places the first arrow, since turn 1 resolves white's half-move in every game. (Solo mode overrides this: you always own white and place every arrow, while the computer lays a trap arrow after each black half-turn.)

On your turn, you place exactly one arrow from any origin square to any destination square on the unified board. You may place an arrow on top of an existing arrow to stack it; stacking adds 8 to that arrow's cardinality and refreshes its decay from the current turn.

Arrow placement is only allowed through turn 100. After that, the match plays out automatically with Stockfish and no further arrows can be placed.

Arrows decay over time. Each arrow has a cardinality (starting at 8) that halves once per full round (two half-moves) after it was last placed or stacked; when it reaches zero the arrow is removed. A fresh arrow pulls up to 8 games on its placement turn and on the opponent's reply, up to 4 around the owner's next arrow, then 2, then 1, then gone.

### Resolution

After each arrow placement, all active games advance by one half-move (one ply) as follows:

1. **Apply arrows**
   - Arrows are processed from most recently placed or stacked to least recent.
   - For each arrow: pull up to its current decay weight (cardinality halved once per round since it was last placed or stacked) in games, each time selecting one game at random from the set of active games that has not yet advanced this turn and for which the arrow is a legal move for the side whose turn it is.
   - An arrow placed on the unified board is interpreted through the vertical flip when the black owner places it, so the same visual arrow represents the same positional idea for both players.
   - If a matching game exists, that move is made and the game is marked as advanced for this turn. Pawn promotion is always to queen. Castling and en passant are legal per standard chess rules.
2. **Stockfish fallback**
   - Any active game that has not yet advanced this turn plays the best move as determined by Stockfish at depth 5 (single-threaded WASM build, running in a web worker), evaluated from the perspective of the side whose turn it is.

### Scoring

When a game ends in checkmate, the player whose side delivered checkmate scores one point. The game is then removed from the active set.

Games that end in a draw (stalemate, threefold repetition, fifty-move rule, or insufficient material) award no points to either player and are removed from the active set.

### Match end

The match ends when one player's score exceeds the other's by more than the number of currently active games (the trailing player cannot catch up even by winning every remaining game).

If all 100 games conclude and both players have equal scores, the match is a draw.

## Architecture

The app follows a strict Elm-style architecture under maximum practical TypeScript strictness — see **[docs/radical-architecture-roadmap.md](./docs/radical-architecture-roadmap.md)** for the principles and current status.

- `src/core/` — pure domain logic: chess rules ([chessops](https://github.com/niklasf/chessops)), match state and arrow resolution (`core/match`), seeded RNG, parsers, codecs. Everything deterministic and testable without a browser.
- `src/features/` — feature reducers (`centurion-match`, `superposition-lab`) plus the canvas superposition renderer.
- `src/ports/` + `src/adapters/` — effect interfaces and their implementations: the Firebase match room and Stockfish (WASM in a web worker, speaking UCI).
- `src/app/` + `src/main.ts` — top-level state machine and the imperative shell that interprets commands.

Each turn resolves in two phases. The arrow phase is pure and deterministic, driven by a seeded RNG shared by both players. The engine phase is asynchronous: Stockfish computes the fallback moves for every game the arrows did not reach (about 100 searches at depth 5, roughly 100ms after warmup).

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
