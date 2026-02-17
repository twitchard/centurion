# Centurion Chess

Two players compete across 100 simultaneous games of chess. In 50 games you play white; in 50 you play black. You view a single shared board displaying a superposition of all active games, and influence them by placing persistent arrows.

## Radical architecture roadmap (new source of truth)

The project is moving to a strict, functional, state-machine-first architecture with:
- maximum practical TypeScript strictness
- explicit discriminated-union app states and transitions
- independently testable superposition renderer and multiplayer modules
- a new top-level menu with three destinations (Superposition Lab, P2P Chat Lab, Centurion Match)

See: **[docs/radical-architecture-roadmap.md](./docs/radical-architecture-roadmap.md)**

This roadmap replaces the older incremental TODO list.

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

## Legacy gameplay rules (current implementation target)

### Board and display

The board is displayed from your perspective: your pieces are always closest to you. The board uses a vertical flip to align the two colors - your white pieces on rank 1 and your black pieces on rank 8 both appear at the bottom of the board. This means initial positions overlap naturally (white king and black king share the same visual square, king pawns overlap, etc.).

Because the vertical flip causes light and dark squares to overlap, the board uses a neutral color scheme (uniform background with subtle grid lines) rather than a traditional checkerboard.

Pieces from all active games are rendered on a single board at 1/100 opacity with slight positional jitter, producing a ghostly superposition. Players may toggle a split view that separates the board into two panels (one for your 50 white games, one for your 50 black games) for inspection, but arrows are always placed on the unified board.

No other game state information is visible - you cannot see individual game positions, which games matched which arrows, or stockfish activity.

### Turns

Players alternate turns. The player controlling more white games goes first (if equal, chosen randomly).

On your turn, you place exactly one arrow from any origin square to any destination square on the unified board. You may place an arrow on top of an existing arrow to stack it, doubling that arrow's potential effect during resolution.

Arrows are permanent and cannot be removed.

### Resolution

After each arrow placement, all active games advance by one half-move (one ply) as follows:

1. **Apply arrows**
   - Each arrow is processed from most recently placed to least recently placed.
   - Each instance on a stack is processed individually (a stack of 2 counts as two separate arrows in the resolution order).
   - For each arrow: select one game at random from the set of active games that:
     - has not yet advanced this turn, and
     - the arrow represents a legal move for the side whose turn it is.
   - An arrow placed on the unified board is interpreted through the vertical flip: a visual arrow represents the same positional idea for both colors. For example, a visual arrow pushing a pawn from the second row to the fourth row corresponds to e2->e4 in your white games and e7->e5 in your black games.
   - If a matching game exists, that move is made and the game is marked as advanced for this turn. Pawn promotion is always to queen. Castling and en passant are legal per standard chess rules.
2. **Stockfish fallback**
   - After all arrows have been processed, any active game that has not yet advanced this turn advances by playing the best move as determined by Stockfish at depth 5, evaluated from the perspective of the side whose turn it is.

### Scoring

When a game ends in checkmate, the player whose side delivered checkmate scores one point. The game is then removed from the active set.

Games that end in a draw (stalemate, threefold repetition, fifty-move rule, insufficient material, or agreement) award no points to either player and are removed from the active set.

### Match end

The match ends when one player's score exceeds the other's by more than the number of currently active games (i.e., the trailing player cannot catch up even by winning every remaining game).

If all 100 games conclude and both players have equal scores, the match is a draw.
