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
import { formatMicroPawns } from './eval'
import type { MatchGame, RecordedMove } from './model'

export interface GameMoveSourceCounts {
  readonly command: number
  readonly free: number
}

export function gameMoveSourceCounts(game: MatchGame): GameMoveSourceCounts {
  let command = 0
  let free = 0
  for (const move of game.moves) {
    if (move.source === 'command') {
      command += 1
    } else {
      free += 1
    }
  }
  return { command, free }
}

/** Games steered most by commands (vs unled soldiers) appear first. */
export function compareGamesForReplay(a: MatchGame, b: MatchGame): number {
  const aCounts = gameMoveSourceCounts(a)
  const bCounts = gameMoveSourceCounts(b)
  if (bCounts.command !== aCounts.command) {
    return bCounts.command - aCounts.command
  }
  if (aCounts.free !== bCounts.free) {
    return aCounts.free - bCounts.free
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
  /** Recorded source data for the move shown as `lastMove`. */
  readonly lastMoveRecord?: RecordedMove
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
  let lastMoveRecord: RecordedMove | undefined
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
    lastMoveRecord = recorded
    position.play(move)
  }
  const snapshot: ReplaySnapshot = {
    fen: makeFen(position.toSetup()),
    ply: clampedPly,
    moveCount: game.moves.length,
  }
  if (lastMove !== undefined && lastMoveRecord !== undefined) {
    return { ...snapshot, lastMove, lastMoveRecord }
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

export interface PlayerNames {
  readonly p1: string
  readonly p2: string
}

const DEFAULT_PLAYER_NAMES: PlayerNames = { p1: 'P1', p2: 'P2' }

export function describeGameReplayLabel(
  game: MatchGame,
  names: PlayerNames = DEFAULT_PLAYER_NAMES,
): string {
  const counts = gameMoveSourceCounts(game)
  const evalNote = `, ${formatMicroPawns(game.evalCp)} (white)`
  return `Game ${game.id + 1} (${counts.command} ordered / ${counts.free} free, ${describeGameResult(game, names)}, ${game.moves.length} plies${evalNote})`
}

export function describeGameResult(
  game: MatchGame,
  names: PlayerNames = DEFAULT_PLAYER_NAMES,
): string {
  if (game.status.tag === 'won') {
    return `${game.status.by === 1 ? names.p1 : names.p2} won`
  }
  if (game.status.tag === 'drawn') {
    return `draw (${game.status.reason})`
  }
  return 'in progress'
}
