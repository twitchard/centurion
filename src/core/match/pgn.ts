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
import type { MatchGame } from './model'

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
    const uci = game.moves[index]
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
  for (const uci of game.moves) {
    const move = parseUci(uci)
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

export function describeGameResult(game: MatchGame): string {
  if (game.status.tag === 'won') {
    return `P${game.status.by} won`
  }
  if (game.status.tag === 'drawn') {
    return `draw (${game.status.reason})`
  }
  return 'in progress'
}
