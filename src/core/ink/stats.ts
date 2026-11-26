import {
  aggregateMicroPawnStats,
  formatMicroPawns,
  microPawnHistogramLabel,
} from '../match/eval'
import type { PositionStatCard } from '../match/position-stat-cards'
import { aggregatePositionStats } from '../match/position-stats'
import type { InkMatch } from './match'
import { inkToMatchState } from './project'

/** The aggregate panel, with copy for a match that starts every game at once. */
export function inkStatCards(match: InkMatch): readonly PositionStatCard[] {
  const view = inkToMatchState(match)
  const viewer = 1 as const
  const stats = aggregatePositionStats(view, viewer)
  const evalStats = aggregateMicroPawnStats(view, viewer)
  const started = match.games.filter(
    (game) => game.status.tag !== 'pending',
  ).length

  return [
    {
      id: 'active-games',
      icon: '▦',
      label: 'Active games',
      value: String(stats.activeGames),
      tip: 'Games still in play. Finished games leave the board.',
    },
    {
      id: 'median-eval',
      icon: '±',
      label: 'Median eval',
      value: formatMicroPawns(evalStats.medianCp),
      tip: microPawnHistogramLabel(view, viewer),
    },
    {
      id: 'started-games',
      icon: '↑',
      label: 'Games',
      value: `${started}/${match.gameCount}`,
      tip: 'Every game started together on the first move. None are held back.',
    },
    {
      id: 'queens',
      icon: '♛',
      label: 'Your queens',
      value: String(stats.queens),
      tip: 'Total queens you own across all active games.',
    },
    {
      id: 'pawn-rank',
      icon: '♙',
      label: 'Avg pawn rank',
      value: stats.averagePawnRank.toFixed(1),
      tip: 'Mean rank of your pawns, 1 on your back rank and 8 on the far side.',
    },
    {
      id: 'in-check',
      icon: '‼',
      label: 'Games in check',
      value: String(stats.gamesInCheck),
      tip: 'Active games where it is your turn and your king is in check.',
    },
    {
      id: 'castle',
      icon: '♜',
      label: 'Castles available',
      value: String(stats.castlesAvailable),
      tip: 'Active games where it is your turn and you still have a castling right.',
    },
    {
      id: 'promotion',
      icon: '♕',
      label: 'Promotions available',
      value: String(stats.promotionsAvailable),
      tip: 'Active games with a pawn that can promote on this move.',
    },
  ]
}
