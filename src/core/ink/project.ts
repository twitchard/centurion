import type { MatchGame, MatchState } from '../match/model'
import { LEGACY_STATIC_SOLDIER_MODE_ROTATION } from '../match/soldier-mode-rotation'
import type { InkMatch } from './match'

/**
 * Project an ink match onto the typed-order match shape so the shared
 * superposition board, histogram, position stats, and move animation can
 * read it. Soldier modes are unused: each ink soldier draws from its
 * temperament instead.
 */
export function inkToMatchState(match: InkMatch): MatchState {
  const games: MatchGame[] = match.games.map((game) => ({
    id: game.id,
    whiteOwner: 1,
    activationTurn: 1,
    startingFen: game.startingFen,
    position: game.position,
    repetition: game.repetition,
    status: game.status,
    moves: game.moves,
    soldierMode: 0,
    evalCp: game.evalCp,
  }))
  return {
    gameCount: match.gameCount,
    games,
    commands: [],
    turn: match.turn,
    firstPlacer: 1,
    scores: match.scores,
    rng: match.rng,
    soldierModeRotation: LEGACY_STATIC_SOLDIER_MODE_ROTATION,
    phase: match.phase,
    lastResolution: null,
  }
}
