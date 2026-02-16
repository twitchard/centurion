// @ts-nocheck
import { ENGINE_DEPTH, NUM_GAMES, RESOLVE_DELAY_MS } from '../engine/constants'
import { Game } from '../engine/game'
import type {
  Arrow,
  BoardCoord,
  GameMode,
  MatchCallbacks,
  NetMessage,
  PlayerNumber,
  ResolvedMove,
  ViewMode,
} from './types'

/** Convert visual coords to board square, accounting for board flip */
function fromVisual(col: number, row: number, flip: boolean): number {
  return flip ? ((7 - row) << 3) | col : (row << 3) | col
}

/** Convert an arrow to a move for a specific game */
function arrowToMove(
  arrow: Arrow,
  gameIndex: number,
): { from: number; to: number } {
  const flip = arrow.player === 1 ? gameIndex >= 50 : gameIndex < 50
  return {
    from: fromVisual(arrow.fc, arrow.fr, flip),
    to: fromVisual(arrow.tc, arrow.tr, flip),
  }
}

function delay(): Promise<void> {
  return new Promise((r) => setTimeout(r, RESOLVE_DELAY_MS))
}

export class MatchState {
  games: Game[] = []
  arrows: Arrow[] = []
  scores: [number, number] = [0, 0]
  currentPlayer: PlayerNumber = 1
  localPlayer: PlayerNumber = 1
  selectedSquare: BoardCoord | null = null
  resolving = false
  matchOver = false
  viewMode: ViewMode = 'all'
  ply = 0
  mode: GameMode = 'pass-and-play'

  private callbacks: MatchCallbacks

  constructor(callbacks: MatchCallbacks) {
    this.callbacks = callbacks
  }

  /** Start a new match */
  start(
    mode: GameMode,
    localPlayer: PlayerNumber,
    firstPlayer?: PlayerNumber,
  ): void {
    this.mode = mode
    this.localPlayer = localPlayer
    this.games = []
    for (let i = 0; i < NUM_GAMES; i++) this.games.push(new Game())
    this.arrows = []
    this.scores = [0, 0]
    this.currentPlayer = firstPlayer ?? (Math.random() < 0.5 ? 1 : 2)
    this.selectedSquare = null
    this.resolving = false
    this.matchOver = false
    this.viewMode = 'all'
    this.ply = 0
    this.callbacks.onStateChange()
  }

  /** Count active (non-finished) games */
  activeCount(): number {
    let count = 0
    for (const g of this.games) if (!g.result) count++
    return count
  }

  /** Whether it's the local player's turn */
  isLocalTurn(): boolean {
    if (this.mode === 'pass-and-play') return true
    return this.currentPlayer === this.localPlayer
  }

  /** Handle a click on the board */
  handleClick(coord: BoardCoord): void {
    if (this.resolving || this.matchOver) return
    if (!this.isLocalTurn()) return

    if (!this.selectedSquare) {
      this.selectedSquare = coord
      this.callbacks.onStateChange()
      return
    }

    // Same square = deselect
    if (
      this.selectedSquare.col === coord.col &&
      this.selectedSquare.row === coord.row
    ) {
      this.selectedSquare = null
      this.callbacks.onStateChange()
      return
    }

    this.placeArrow(
      this.selectedSquare.col,
      this.selectedSquare.row,
      coord.col,
      coord.row,
    )
  }

  /** Update scores for any newly finished games */
  private updateScores(): void {
    for (let gi = 0; gi < NUM_GAMES; gi++) {
      const g = this.games[gi]
      if (g.result && !g.scored) {
        g.scored = true
        if (g.result === 1) this.scores[gi < 50 ? 0 : 1]++
        else if (g.result === -1) this.scores[gi < 50 ? 1 : 0]++
      }
    }
  }

  /** Add or stack an arrow */
  private addArrow(fc: number, fr: number, tc: number, tr: number): void {
    for (const a of this.arrows) {
      if (a.fc === fc && a.fr === fr && a.tc === tc && a.tr === tr) {
        a.stack++
        return
      }
    }
    this.arrows.push({ fc, fr, tc, tr, player: this.currentPlayer, stack: 1 })
  }

  /** Place an arrow and trigger resolution */
  private placeArrow(fc: number, fr: number, tc: number, tr: number): void {
    this.addArrow(fc, fr, tc, tr)
    this.selectedSquare = null
    this.callbacks.onStateChange()

    // In online mode, send arrow to peer
    if (this.mode === 'online-host' || this.mode === 'online-guest') {
      this.callbacks.onSendMessage?.({ type: 'arrow', fc, fr, tc, tr })
    }

    // Host or pass-and-play: resolve locally
    if (this.mode === 'pass-and-play' || this.mode === 'online-host') {
      setTimeout(() => this.resolve(), 30)
    }
    // Guest waits for host's resolution
  }

  /** Handle pass (no arrow placement) */
  pass(): void {
    if (this.resolving || this.matchOver) return
    if (!this.isLocalTurn()) return

    if (this.mode === 'online-host' || this.mode === 'online-guest') {
      this.callbacks.onSendMessage?.({ type: 'pass' })
    }

    if (this.mode === 'pass-and-play' || this.mode === 'online-host') {
      this.resolve()
    }
  }

  /** Receive an arrow from a remote peer (host receives this) */
  receiveArrow(fc: number, fr: number, tc: number, tr: number): void {
    this.addArrow(fc, fr, tc, tr)
    this.callbacks.onStateChange()

    // Host resolves after receiving guest's arrow
    if (this.mode === 'online-host') {
      setTimeout(() => this.resolve(), 30)
    }
  }

  /** Receive a pass from a remote peer */
  receivePass(): void {
    if (this.mode === 'online-host') {
      this.resolve()
    }
  }

  /** Run resolution: apply arrows then engine moves */
  private async resolve(): Promise<void> {
    this.resolving = true
    this.callbacks.onResolving('Resolving...')
    await delay()

    const advanced = new Set<number>()
    const resolvedMoves: ResolvedMove[] = []

    // Flatten arrows (stacked arrows contribute multiple times)
    const flat: Arrow[] = []
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i]
      for (let s = 0; s < a.stack; s++) flat.push(a)
    }

    // Apply arrows to random eligible games
    for (const arrow of flat) {
      const eligible: { gi: number; from: number; to: number }[] = []
      for (let gi = 0; gi < NUM_GAMES; gi++) {
        if (this.games[gi].result || advanced.has(gi)) continue
        const coords = arrowToMove(arrow, gi)
        const legal = this.games[gi].findLegalMove(coords.from, coords.to)
        if (legal) eligible.push({ gi, from: coords.from, to: coords.to })
      }
      if (eligible.length > 0) {
        const pick = eligible[Math.floor(Math.random() * eligible.length)]
        const move = this.games[pick.gi].findLegalMove(pick.from, pick.to)!
        this.games[pick.gi].makeMove(move)
        this.games[pick.gi].checkEnd()
        advanced.add(pick.gi)
        resolvedMoves.push({ gameIndex: pick.gi, from: pick.from, to: pick.to })
      }
    }

    // Engine moves for remaining games
    let fallbackCount = 0
    for (let gi = 0; gi < NUM_GAMES; gi++) {
      if (!this.games[gi].result && !advanced.has(gi)) fallbackCount++
    }

    if (fallbackCount > 0) {
      this.callbacks.onResolving(`Engine thinking (${fallbackCount})...`)
      await delay()
    }

    for (let gi = 0; gi < NUM_GAMES; gi++) {
      if (this.games[gi].result || advanced.has(gi)) continue
      const best = this.games[gi].bestMove(ENGINE_DEPTH)
      if (best) {
        this.games[gi].makeMove(best)
        this.games[gi].checkEnd()
        resolvedMoves.push({ gameIndex: gi, from: best.from, to: best.to })
      } else {
        this.games[gi].result = 2
      }
    }

    this.updateScores()

    this.ply++
    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1
    this.selectedSquare = null
    this.resolving = false

    // Send resolution to guest
    if (this.mode === 'online-host') {
      this.callbacks.onSendMessage?.({ type: 'resolved', moves: resolvedMoves })
    }

    this.callbacks.onResolved()
    this.checkEnd()
    this.callbacks.onStateChange()
  }

  /** Apply resolution results from host (guest side) */
  applyResolution(moves: ResolvedMove[]): void {
    for (const rm of moves) {
      const game = this.games[rm.gameIndex]
      if (game.result) continue
      const legal = game.findLegalMove(rm.from, rm.to)
      if (legal) {
        game.makeMove(legal)
        game.checkEnd()
      }
    }

    this.updateScores()

    this.ply++
    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1
    this.selectedSquare = null
    this.resolving = false

    this.checkEnd()
    this.callbacks.onStateChange()
  }

  /** Handle incoming network message */
  receiveMessage(msg: NetMessage): void {
    switch (msg.type) {
      case 'arrow':
        this.receiveArrow(msg.fc, msg.fr, msg.tc, msg.tr)
        break
      case 'pass':
        this.receivePass()
        break
      case 'resolved':
        this.applyResolution(msg.moves)
        break
      case 'init':
        // Guest receives init from host
        this.start(
          'online-guest',
          msg.firstPlayer === 1 ? 2 : 1,
          msg.firstPlayer,
        )
        break
      case 'rematch':
        break
    }
  }

  private checkEnd(): void {
    const active = this.activeCount()
    const diff = Math.abs(this.scores[0] - this.scores[1])
    if (active === 0 || diff > active) {
      this.matchOver = true
      this.callbacks.onGameOver({
        scores: this.scores,
        gamesPlayed: NUM_GAMES - active,
      })
    }
  }

  /** Get the view player for rendering (who's perspective we show) */
  get viewPlayer(): PlayerNumber {
    if (this.mode === 'pass-and-play') return this.currentPlayer
    return this.localPlayer
  }
}
