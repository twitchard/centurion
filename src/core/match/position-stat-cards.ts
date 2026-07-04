import {
  aggregateMicroPawnStats,
  formatMicroPawns,
  microPawnHistogramLabel,
} from './eval'
import { type MatchState, type PlayerId, startedGameCount } from './model'
import { aggregatePositionStats } from './position-stats'

export interface PositionStatCard {
  readonly id: string
  readonly icon: string
  readonly label: string
  readonly value: string
  readonly tip: string
}

/** Every position stat shown in the match stats grid. */
export function positionStatCards(
  match: MatchState,
  viewer: PlayerId,
): readonly PositionStatCard[] {
  const stats = aggregatePositionStats(match, viewer)
  const evalStats = aggregateMicroPawnStats(match, viewer)
  const started = startedGameCount(match)

  return [
    {
      id: 'active-games',
      icon: '▦',
      label: 'Active games',
      value: String(stats.activeGames),
      tip: 'Games currently in play. Only active games are evaluated and resolved each turn; pending wave games are excluded until they enter play.',
    },
    {
      id: 'median-eval',
      icon: '±',
      label: 'Median eval',
      value: formatMicroPawns(evalStats.medianCp),
      tip: microPawnHistogramLabel(match, viewer),
    },
    {
      id: 'started-games',
      icon: '↑',
      label: 'Started games',
      value: `${started}/${match.gameCount}`,
      tip: `Games that have entered the match so far (${started}) out of the full ${match.gameCount}-game roster. More games join in waves as turns advance.`,
    },
    {
      id: 'queens',
      icon: '♛',
      label: 'Your queens',
      value: String(stats.queens),
      tip: 'Total queens you own across all active games, summed over the superposition. Multiple games can each contribute a queen.',
    },
    {
      id: 'pawn-rank',
      icon: '♙',
      label: 'Avg pawn rank',
      value: stats.averagePawnRank.toFixed(1),
      tip: 'Mean rank (1 = your back rank, 8 = far side) of your pawns across active games, averaged from your perspective. Higher means your pawn mass has advanced further.',
    },
    {
      id: 'in-check',
      icon: '‼',
      label: 'Games in check',
      value: String(stats.gamesInCheck),
      tip: 'Active games where it is your turn and your king is in check. These games need a move that gets out of check.',
    },
    {
      id: 'castle',
      icon: '♜',
      label: 'Castles available',
      value: String(stats.castlesAvailable),
      tip: 'Active games where it is your turn and you still have at least one castling right (kingside or queenside).',
    },
    {
      id: 'promotion',
      icon: '♕',
      label: 'Promotions available',
      value: String(stats.promotionsAvailable),
      tip: 'Active games where it is your turn and you have at least one legal pawn move that promotes on the next step.',
    },
  ]
}
