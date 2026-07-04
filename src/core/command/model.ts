/**
 * The move-predicate DSL behind natural-language commands.
 *
 * A command is compiled (by an LLM, at the edge) into a `CommandPredicate`:
 * a small JSON term describing a *property a single chess move can have*.
 * The predicate is what enters match state — applying it to a game's legal
 * moves is pure and deterministic, so both peers replay it identically and
 * the LLM's nondeterminism stays quarantined at the compile step.
 *
 * Deliberate expressiveness ceiling: a predicate can only reference
 * properties checkable against one candidate move in one position. No
 * evaluations, no conditionals over game identity — the DSL, not the word
 * limit, is what stops a command from micromanaging individual games.
 */

export type PieceRole = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'

export const PIECE_ROLES: readonly PieceRole[] = [
  'pawn',
  'knight',
  'bishop',
  'rook',
  'queen',
  'king',
]

export type FileLetter = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'

export const FILE_LETTERS: readonly FileLetter[] = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
]

/**
 * A rectangular patch of the board. Files are absolute (a–h, the same for
 * both colors, so "kingside" is always e–h). Ranks default to the mover's
 * side (1 = the mover's back rank, 8 = the promotion rank), so "advance to
 * the 6th rank" means the same positional idea for both colors. Literal
 * chess notation sets `absolute: true` so ranks are standard board ranks
 * (1 = White's back rank, 8 = Black's back rank).
 */
export interface SquareRegion {
  readonly files?: { readonly from: FileLetter; readonly to: FileLetter }
  readonly ranks?: { readonly from: number; readonly to: number }
  readonly absolute?: true
}

export type CommandPredicate =
  /** The moving piece is one of these roles. */
  | { readonly tag: 'piece'; readonly roles: readonly PieceRole[] }
  /** The move starts inside the region. */
  | { readonly tag: 'from'; readonly region: SquareRegion }
  /** The move ends inside the region. */
  | { readonly tag: 'to'; readonly region: SquareRegion }
  /** The move captures; optionally only captures of these roles count. */
  | { readonly tag: 'captures'; readonly roles?: readonly PieceRole[] }
  /** The move gives check. */
  | { readonly tag: 'gives-check' }
  /** The move castles (either side). */
  | { readonly tag: 'castles' }
  /** The move promotes a pawn. */
  | { readonly tag: 'promotes' }
  /** The move ends on a higher rank (from the mover's side) than it started. */
  | { readonly tag: 'advances' }
  /** The move ends on a lower rank (from the mover's side) than it started. */
  | { readonly tag: 'retreats' }
  /** After the move, the moved piece attacks an enemy piece of one of these roles. */
  | { readonly tag: 'attacks'; readonly roles: readonly PieceRole[] }
  /** The moving piece is currently attacked by an enemy piece. */
  | { readonly tag: 'escapes' }
  /** After the move, the moved piece is safe (see `safety.ts`). */
  | { readonly tag: 'safe' }
  | { readonly tag: 'not'; readonly inner: CommandPredicate }
  | { readonly tag: 'and'; readonly all: readonly CommandPredicate[] }
  | { readonly tag: 'or'; readonly any: readonly CommandPredicate[] }
  /** First option with any matching legal moves wins; later options are fallback. */
  | { readonly tag: 'prefer'; readonly options: readonly CommandPredicate[] }

/** Hard cap on total predicate nodes; the codec rejects anything larger. */
export const MAX_PREDICATE_NODES = 16

/** Hard cap on nesting depth (a bare leaf has depth 1). */
export const MAX_PREDICATE_DEPTH = 5

/** Maximum children of one `and`/`or` node. */
export const MAX_COMBINATOR_ARITY = 8

export function predicateNodeCount(predicate: CommandPredicate): number {
  switch (predicate.tag) {
    case 'not':
      return 1 + predicateNodeCount(predicate.inner)
    case 'and':
      return (
        1 +
        predicate.all.reduce((sum, child) => sum + predicateNodeCount(child), 0)
      )
    case 'or':
      return (
        1 +
        predicate.any.reduce((sum, child) => sum + predicateNodeCount(child), 0)
      )
    case 'prefer':
      return (
        1 +
        predicate.options.reduce(
          (sum, child) => sum + predicateNodeCount(child),
          0,
        )
      )
    default:
      return 1
  }
}
