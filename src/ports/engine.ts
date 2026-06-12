/** A UCI chess engine that picks one move per position. */
export interface EnginePort {
  /**
   * Compute the best move (UCI notation) for each FEN at the given
   * fixed depth. Resolves in input order.
   */
  bestMoves(fens: readonly string[], depth: number): Promise<readonly string[]>

  /**
   * Compute the worst legal move (UCI notation) for each FEN at the
   * given fixed depth — the lowest-ranked root move of a full MultiPV
   * search. Resolves in input order. Used by the solo opponent to lay
   * trap arrows on the player's weakest continuation.
   */
  worstMoves(fens: readonly string[], depth: number): Promise<readonly string[]>
}
