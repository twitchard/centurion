import type { Chess } from 'chessops/chess'
import { squareRank } from 'chessops/util'
import type { MatchGame, MatchState, PlayerId } from './model'

export interface PositionStats {
  readonly activeGames: number
  /** Viewer queens across all active games. */
  readonly queens: number
  /** Mean rank (1–8) of viewer pawns, from the viewer's side. */
  readonly averagePawnRank: number
  /** Active games where the viewer is in check. */
  readonly gamesInCheck: number
  /** Active games where the viewer still has castling rights on their turn. */
  readonly castlesAvailable: number
  /** Active games with at least one pawn promotion available. */
  readonly promotionsAvailable: number
}

function viewerColor(game: MatchGame, viewer: PlayerId): 'white' | 'black' {
  return game.whiteOwner === viewer ? 'white' : 'black'
}

function relativeRankFromViewer(
  square: number,
  viewer: PlayerId,
  whiteOwner: PlayerId,
): number {
  const boardRank = squareRank(square) + 1
  const viewerIsWhite = viewer === whiteOwner
  return viewerIsWhite ? boardRank : 9 - boardRank
}

function hasPromotionMove(position: Chess): boolean {
  for (const [from, dests] of position.allDests()) {
    const piece = position.board.get(from)
    if (piece === undefined || piece.role !== 'pawn') {
      continue
    }
    for (const to of dests) {
      const rank = squareRank(to)
      if (rank === 0 || rank === 7) {
        return true
      }
    }
  }
  return false
}

function countViewerQueens(game: MatchGame, viewer: PlayerId): number {
  const color = viewerColor(game, viewer)
  return game.position.board.pieces(color, 'queen').size()
}

function averageViewerPawnRank(
  game: MatchGame,
  viewer: PlayerId,
): number | null {
  const color = viewerColor(game, viewer)
  const pawns = game.position.board.pieces(color, 'pawn')
  if (pawns.isEmpty()) {
    return null
  }
  let sum = 0
  let count = 0
  for (const square of pawns) {
    sum += relativeRankFromViewer(square, viewer, game.whiteOwner)
    count += 1
  }
  return count === 0 ? null : sum / count
}

function viewerInCheck(game: MatchGame, viewer: PlayerId): boolean {
  const side = viewerColor(game, viewer)
  if (game.position.turn !== side) {
    return false
  }
  return game.position.isCheck()
}

function viewerCanCastle(game: MatchGame, viewer: PlayerId): boolean {
  const side = viewerColor(game, viewer)
  if (game.position.turn !== side) {
    return false
  }
  const rights = game.position.toSetup().castlingRights
  for (const square of rights) {
    const piece = game.position.board.get(square)
    if (piece?.color === side) {
      return true
    }
  }
  return false
}

function viewerHasPromotion(game: MatchGame, viewer: PlayerId): boolean {
  const side = viewerColor(game, viewer)
  if (game.position.turn !== side) {
    return false
  }
  return hasPromotionMove(game.position)
}

/** Aggregate positional facts across every active game for one viewer. */
export function aggregatePositionStats(
  match: MatchState,
  viewer: PlayerId,
): PositionStats {
  let activeGames = 0
  let queens = 0
  let pawnRankSum = 0
  let pawnRankGames = 0
  let gamesInCheck = 0
  let castlesAvailable = 0
  let promotionsAvailable = 0

  for (const game of match.games) {
    if (game.status.tag !== 'active') {
      continue
    }
    activeGames += 1
    queens += countViewerQueens(game, viewer)
    const pawnRank = averageViewerPawnRank(game, viewer)
    if (pawnRank !== null) {
      pawnRankSum += pawnRank
      pawnRankGames += 1
    }
    if (viewerInCheck(game, viewer)) {
      gamesInCheck += 1
    }
    if (viewerCanCastle(game, viewer)) {
      castlesAvailable += 1
    }
    if (viewerHasPromotion(game, viewer)) {
      promotionsAvailable += 1
    }
  }

  return {
    activeGames,
    queens,
    averagePawnRank: pawnRankGames === 0 ? 0 : pawnRankSum / pawnRankGames,
    gamesInCheck,
    castlesAvailable,
    promotionsAvailable,
  }
}
