# Centurion Chess

Two players compete across 100 simultaneous games of chess. In 50 games you play white; in 50 you play black. You view a single shared board displaying a superposition of all active games, and influence them by placing persistent arrows.

**The full match is playable**: pass-and-play on one device, or serverless P2P multiplayer with a 6-digit match code.

## Playing

Run `bun install` then `bun run dev` and open the app.

- **/** — Centurion Chess. Pass & Play starts a hot-seat match immediately; New Multiplayer Match creates a room code for a WebRTC peer (via Trystero), and Join with code connects to one.
- **/labs** — developer labs: the Superposition Board Lab (render arbitrary FEN/arrow sets) and the P2P Chat Lab (transport smoke test).

Place an arrow by clicking its origin and destination squares on the board (or typing notation like `e2->e4`). Each player sees the board from their own perspective; player 2's view is rank-flipped, so the same visual arrow means the same positional idea for both sides.

## Gameplay rules (implemented)

### Board and display

The board is displayed from your perspective: your pieces are always closest to you. The board uses a vertical flip to align the two colors — your white pieces on rank 1 and your black pieces on rank 8 both appear at the bottom of the board. This means initial positions overlap naturally (white king and black king share the same visual square, king pawns overlap, etc.).

Pieces from all active games are rendered on a single board with opacity proportional to how many games contain that piece on that square, producing a ghostly superposition. No other game state information is visible — you cannot see individual game positions or which games matched which arrows.

### Turns

Players alternate turns. The player going first is chosen from the match seed (each player controls 50 white games, so the choice is effectively a coin flip).

On your turn, you place exactly one arrow from any origin square to any destination square on the unified board. You may place an arrow on top of an existing arrow to stack it, doubling that arrow's potential effect during resolution.

Arrows are permanent and cannot be removed.

### Resolution

After each arrow placement, all active games advance by one half-move (one ply) as follows:

1. **Apply arrows**
   - Each arrow is processed from most recently placed to least recently placed; each instance of a stacked arrow is processed individually.
   - For each arrow: select one game at random from the set of active games that has not yet advanced this turn and for which the arrow is a legal move for the side whose turn it is.
   - An arrow placed on the unified board is interpreted through the vertical flip: a visual arrow represents the same positional idea for both colors. For example, a visual arrow pushing a pawn from the second row to the fourth row corresponds to e2->e4 in your white games and e7->e5 in your black games.
   - If a matching game exists, that move is made and the game is marked as advanced for this turn. Pawn promotion is always to queen. Castling and en passant are legal per standard chess rules.
2. **Engine fallback**
   - Any active game that has not yet advanced this turn plays a move chosen by the built-in fallback engine: a deterministic shallow material search with a mating-drive heuristic, so games actually conclude rather than shuffling forever.

> **Deviation from the original vision:** the spec called for Stockfish at depth 5 as the fallback. The implementation uses a small deterministic engine instead, because multiplayer is serverless lockstep — both peers replay each turn from a shared seed, and the fallback must produce byte-identical moves on both machines with no WASM worker or network dependency. Swapping in a deterministic Stockfish build later would be a drop-in change behind `core/match/engine.ts`.

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
- `src/ports/` + `src/adapters/` — effect interfaces and their Trystero/browser implementations.
- `src/app/` + `src/main.ts` — top-level state machine and the imperative shell that interprets commands.

Multiplayer works without a server: the host generates a seed, sends it to the guest, and from then on the only messages exchanged are the placed arrows. Both clients resolve every turn deterministically from the shared seed, staying in lockstep.

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
