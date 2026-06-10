/** A UCI chess engine that picks one best move per position. */
export interface EnginePort {
  /**
   * Compute the best move (UCI notation) for each FEN at the given
   * fixed depth. Resolves in input order.
   */
  bestMoves(fens: readonly string[], depth: number): Promise<readonly string[]>
}
