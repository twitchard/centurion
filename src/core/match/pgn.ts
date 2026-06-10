import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import {
  ChildNode,
  type Game,
  Node,
  type PgnNodeData,
  makeOutcome,
  makePgn,
} from 'chessops/pgn'
import { makeSanAndPlay } from 'chessops/san'
import { isNormal } from 'chessops/types'
import { makeSquare, parseUci } from 'chessops/util'
import type { MatchGame, RecordedMove } from './model'

export interface GameMoveSourceCounts {
  readonly arrow: number
  readonly engine: number
}

export function gameMoveSourceCounts(game: MatchGame): GameMoveSourceCounts {
  let arrow = 0
  let engine = 0
  for (const move of game.moves) {
    if (move.source === 'arrow') {
      arrow += 1
    } else {
      engine += 1
    }
  }
  return { arrow, engine }
}

/** Games steered most by arrows (vs Stockfish) appear first. */
export function compareGamesForReplay(a: MatchGame, b: MatchGame): number {
  const aCounts = gameMoveSourceCounts(a)
  const bCounts = gameMoveSourceCounts(b)
  if (bCounts.arrow !== aCounts.arrow) {
    return bCounts.arrow - aCounts.arrow
  }
  if (aCounts.engine !== bCounts.engine) {
    return aCounts.engine - bCounts.engine
  }
  return a.id - b.id
}

export function gamesForReplaySelection(
  games: readonly MatchGame[],
): readonly MatchGame[] {
  return [...games].sort(compareGamesForReplay)
}

export function defaultReplayGameId(games: readonly MatchGame[]): number {
  const [first] = gamesForReplaySelection(games)
  return first?.id ?? 0
}

function recordedUci(move: RecordedMove): string {
  return move.uci
}

export const STANDARD_START_FEN = makeFen(Chess.default().toSetup())

export interface ReplaySnapshot {
  readonly fen: string
  readonly lastMove?: readonly [string, string]
  readonly ply: number
  readonly moveCount: number
}

export interface MatchGamePgnLabels {
  readonly white: string
  readonly black: string
  readonly round?: string
}

function outcomeForPgn(game: MatchGame): string {
  if (game.status.tag === 'won') {
    const winnerColor = game.status.by === game.whiteOwner ? 'white' : 'black'
    return makeOutcome({ winner: winnerColor })
  }
  if (game.status.tag === 'drawn') {
    return makeOutcome({ winner: undefined })
  }
  return '*'
}

export function replaySnapshot(game: MatchGame, ply: number): ReplaySnapshot {
  const position = Chess.fromSetup(parseFen(game.startingFen).unwrap()).unwrap()
  let lastMove: [string, string] | undefined
  const clampedPly = Math.max(0, Math.min(ply, game.moves.length))
  for (let index = 0; index < clampedPly; index++) {
    const recorded = game.moves[index]
    if (recorded === undefined) {
      break
    }
    const uci = recordedUci(recorded)
    if (uci === undefined) {
      break
    }
    const move = parseUci(uci)
    if (move === undefined || !isNormal(move)) {
      break
    }
    lastMove = [makeSquare(move.from), makeSquare(move.to)]
    position.play(move)
  }
  const snapshot: ReplaySnapshot = {
    fen: makeFen(position.toSetup()),
    ply: clampedPly,
    moveCount: game.moves.length,
  }
  if (lastMove !== undefined) {
    return { ...snapshot, lastMove }
  }
  return snapshot
}

export function matchGameToPgn(
  game: MatchGame,
  labels?: MatchGamePgnLabels,
): string {
  const headers = new Map<string, string>([
    ['Event', 'Centurion Chess'],
    ['Site', 'Centurion Chess'],
    ['Round', labels?.round ?? String(game.id + 1)],
    ['White', labels?.white ?? `Player ${game.whiteOwner}`],
    ['Black', labels?.black ?? `Player ${game.whiteOwner === 1 ? 2 : 1}`],
    ['Result', outcomeForPgn(game)],
  ])

  if (game.startingFen !== STANDARD_START_FEN) {
    headers.set('FEN', game.startingFen)
    headers.set('SetUp', '1')
  }

  const position = Chess.fromSetup(parseFen(game.startingFen).unwrap()).unwrap()
  const root = new Node<PgnNodeData>()
  let parent = root
  for (const recorded of game.moves) {
    const move = parseUci(recordedUci(recorded))
    if (move === undefined || !isNormal(move)) {
      break
    }
    const san = makeSanAndPlay(position, move)
    const child = new ChildNode({ san })
    parent.children.push(child)
    parent = child
  }

  const pgnGame: Game<PgnNodeData> = { headers, moves: root }
  return makePgn(pgnGame)
}

export function describeGameReplayLabel(game: MatchGame): string {
  const counts = gameMoveSourceCounts(game)
  return `Game ${game.id + 1} (${counts.arrow} arrow / ${counts.engine} engine, ${describeGameResult(game)}, ${game.moves.length} plies)`
}

export function describeGameResult(game: MatchGame): string {
  if (game.status.tag === 'won') {
    return `P${game.status.by} won`
  }
  if (game.status.tag === 'drawn') {
    return `draw (${game.status.reason})`
  }
  return 'in progress'
}
