# Centurion Chess

Two players compete across 100 simultaneous games of chess. One player is white in every game and the other is black; which player gets which color is chosen at random when the match starts. You view a single shared board displaying a superposition of all active games, and influence them by placing persistent arrows.

**The full match is playable**: pass-and-play on one device, or serverless P2P multiplayer with a 6-digit match code.

## Playing

Run `bun install` then `bun run dev` and open the app.

- **/** — Centurion Chess. Pass & Play starts a hot-seat match immediately; New Multiplayer Match creates a room code for a WebRTC peer (via Trystero), and Join with code connects to one.
- **/labs** — developer labs: the Superposition Board Lab (render arbitrary FEN/arrow sets) and the P2P Chat Lab (transport smoke test).

Place an arrow by clicking its origin and destination squares on the board (or typing notation like `e2->e4`). Each player sees the board from their own perspective; player 2's view is rank-flipped, so the same visual arrow means the same positional idea for both sides.

## Gameplay rules (implemented)

### Board and display

The board is displayed from your perspective: your pieces are always closest to you. The player who owns black sees the board rank-flipped so their pieces sit at the bottom, matching the white owner's view of the starting position.

Pieces from all active games are rendered on a single board with opacity proportional to how many games contain that piece on that square, producing a ghostly superposition. No other game state information is visible — you cannot see individual game positions or which games matched which arrows.

### Turns

Players alternate turns. Who plays white and who goes first are both chosen from the match seed at the start of the match.

On your turn, you place exactly one arrow from any origin square to any destination square on the unified board. You may place an arrow on top of an existing arrow to stack it; stacking adds 8 to that arrow's cardinality and refreshes its decay from the current turn.

Arrow placement is only allowed through turn 100. After that, the match plays out automatically with Stockfish and no further arrows can be placed.

Arrows decay over time. Each arrow has a cardinality (starting at 8) that halves each turn after it was last placed or stacked; when it reaches zero the arrow is removed. On the placement turn an arrow with cardinality 8 pulls up to 8 games, then 4, 2, 1, then gone.

### Resolution

After each arrow placement, all active games advance by one half-move (one ply) as follows:

1. **Apply arrows**
   - Arrows are processed from most recently placed or stacked to least recent.
   - For each arrow: pull up to its current decay weight (cardinality halved each turn since it was last placed or stacked) in games, each time selecting one game at random from the set of active games that has not yet advanced this turn and for which the arrow is a legal move for the side whose turn it is.
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
- `src/features/` — feature reducers (`centurion-match`, `chat-lab`, `superposition-lab`) plus the canvas superposition renderer.
- `src/ports/` + `src/adapters/` — effect interfaces and their implementations: Trystero (WebRTC transport) and Stockfish (WASM in a web worker, speaking UCI).
- `src/app/` + `src/main.ts` — top-level state machine and the imperative shell that interprets commands.

Each turn resolves in two phases. The arrow phase is pure and deterministic, driven by a seeded RNG shared by both players. The engine phase is asynchronous: Stockfish computes the fallback moves for every game the arrows did not reach (about 100 searches at depth 5, roughly 100ms after warmup).

Multiplayer works without a server. The host sends the guest a seed; after that the only message per turn is the placed arrow plus Stockfish's chosen moves, computed once by the player who placed the arrow. The opponent replays the deterministic arrow phase from the shared seed and applies the received engine moves after validating their legality — so the two clients stay in lockstep without requiring Stockfish itself to be bit-for-bit reproducible across machines.

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
