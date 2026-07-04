import type { RankedMove } from '../core/match/resolve'

/** A UCI chess engine that ranks every root move per position. */
export interface EnginePort {
  /**
   * Rank all legal root moves (UCI + centipawns from the mover's
   * perspective, mates mapped to ±(MATE_CP - plies)) for each FEN at the
   * given fixed depth, best first. Resolves in input order.
   */
  rankedMoves(
    fens: readonly string[],
    depth: number,
  ): Promise<readonly (readonly RankedMove[])[]>
}
