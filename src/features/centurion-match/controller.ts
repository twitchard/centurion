import { PeerConnection } from '../../net/connection'
import type { ConnectionStatus } from '../../net/types'
import { BoardRenderer } from '../../render/board'
import { OverlayRenderer } from '../../render/overlay'
import { MatchState } from '../../state/match'
import type {
  MatchResult,
  NetMessage,
  PlayerNumber,
  ResolvedMove,
} from '../../state/types'

type CenturionView = 'start' | 'lobby-create' | 'lobby-join' | 'game'

interface CenturionControllerOptions {
  readonly root: HTMLElement
  readonly onRequestExit: () => void
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPlayerNumber(value: unknown): value is PlayerNumber {
  return value === 1 || value === 2
}

function decodeResolvedMoves(value: unknown): NetMessage | null {
  if (!Array.isArray(value)) {
    return null
  }
  const moves: ResolvedMove[] = []
  for (const entry of value) {
    if (!isObjectRecord(entry)) {
      return null
    }
    const { gameIndex, from, to } = entry
    if (
      typeof gameIndex !== 'number' ||
      typeof from !== 'number' ||
      typeof to !== 'number'
    ) {
      return null
    }
    moves.push({ gameIndex, from, to })
  }
  return { type: 'resolved', moves }
}

function decodeNetMessage(payload: unknown): NetMessage | null {
  if (!isObjectRecord(payload)) {
    return null
  }

  const { type } = payload
  if (type === 'pass' || type === 'rematch') {
    return { type }
  }

  if (type === 'init') {
    const { firstPlayer } = payload
    if (!isPlayerNumber(firstPlayer)) {
      return null
    }
    return {
      type: 'init',
      firstPlayer,
    }
  }

  if (type === 'arrow') {
    const { fc, fr, tc, tr } = payload
    if (
      typeof fc !== 'number' ||
      typeof fr !== 'number' ||
      typeof tc !== 'number' ||
      typeof tr !== 'number'
    ) {
      return null
    }
    return {
      type: 'arrow',
      fc,
      fr,
      tc,
      tr,
    }
  }

  if (type === 'resolved') {
    const resolvedPayload = payload as { type: 'resolved'; moves: unknown }
    return decodeResolvedMoves(resolvedPayload.moves)
  }

  return null
}

export class CenturionMatchController {
  private readonly root: HTMLElement
  private readonly onRequestExit: () => void

  private boardRenderer: BoardRenderer | null = null
  private overlayRenderer: OverlayRenderer | null = null
  private eventsBound = false
  private active = false

  private readonly match: MatchState
  private readonly connection!: PeerConnection

  constructor(options: CenturionControllerOptions) {
    this.root = options.root
    this.onRequestExit = options.onRequestExit

    this.match = new MatchState({
      onStateChange: () => this.renderBoard(),
      onResolving: () => {},
      onResolved: () => {},
      onGameOver: (result: MatchResult) => this.showGameOver(result),
      onSendMessage: (message: NetMessage) => this.connection.send(message),
    })

    this.connection = new PeerConnection({
      onStatusChange: (status: ConnectionStatus) =>
        this.onConnectionStatus(status),
      onPeerJoin: () => this.onPeerJoin(),
      onPeerLeave: () => this.onPeerLeave(),
      onMessage: (payload: unknown) => this.onMessage(payload),
    })
  }

  mount(): void {
    this.active = true
    this.bindEventsOnce()
    this.showView('start')
    this.hideGameOver()
  }

  unmount(): void {
    this.active = false
    this.connection.disconnect()
    this.hideGameOver()
    this.showView('start')
  }

  private bindEventsOnce(): void {
    if (this.eventsBound) {
      return
    }
    this.eventsBound = true

    this.button('centurion-back-btn').addEventListener('click', () => {
      this.connection.disconnect()
      this.showView('start')
      this.hideGameOver()
      this.onRequestExit()
    })

    this.button('centurion-btn-pass-play').addEventListener('click', () => {
      this.match.start('pass-and-play', 1)
      this.showView('game')
      this.initCanvasIfNeeded()
      this.renderBoard()
    })

    this.button('centurion-btn-create-room').addEventListener('click', () => {
      const code = this.connection.createRoom()
      this.showView('lobby-create')
      this.updateCreateLobby(code, 'waiting')
    })

    this.button('centurion-btn-join-room').addEventListener('click', () => {
      this.showView('lobby-join')
      this.input('centurion-code-input').focus()
    })

    this.button('centurion-share-btn').addEventListener('click', () => {
      this.shareRoomCode(this.connection.code).catch(() => {})
    })

    this.button('centurion-create-back').addEventListener('click', () => {
      this.connection.disconnect()
      this.showView('start')
    })

    this.button('centurion-join-btn').addEventListener('click', () => {
      const code = this.input('centurion-code-input').value.trim()
      if (/^\d{6}$/.test(code)) {
        this.connection.joinRoom(code)
      } else {
        this.updateJoinLobby('error')
      }
    })

    this.input('centurion-code-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.button('centurion-join-btn').click()
      }
    })

    this.button('centurion-join-back').addEventListener('click', () => {
      this.connection.disconnect()
      this.showView('start')
    })

    this.button('centurion-pass-btn').addEventListener('click', () => {
      this.match.pass()
    })

    this.button('centurion-new-match-btn').addEventListener('click', () => {
      this.connection.disconnect()
      this.hideGameOver()
      this.showView('start')
    })

    window.addEventListener('resize', () => {
      if (!this.active) {
        return
      }
      if (this.currentView() === 'game') {
        this.resize()
        this.renderBoard()
      }
    })
  }

  private onConnectionStatus(status: ConnectionStatus): void {
    if (!this.active) {
      return
    }

    if (this.connection.isHost) {
      this.updateCreateLobby(this.connection.code, status)
      return
    }
    this.updateJoinLobby(status)
  }

  private onPeerJoin(): void {
    if (!this.active || !this.connection.isHost) {
      return
    }

    const firstPlayer: PlayerNumber = Math.random() < 0.5 ? 1 : 2
    this.match.start('online-host', 1, firstPlayer)
    this.connection.send({ type: 'init', firstPlayer })
    this.showView('game')
    this.initCanvasIfNeeded()
    this.renderBoard()
  }

  private onPeerLeave(): void {
    if (!this.active) {
      return
    }
    if (this.connection.isHost) {
      this.updateCreateLobby(this.connection.code, 'waiting')
      this.showView('lobby-create')
      return
    }
    this.updateJoinLobby('disconnected')
    this.showView('lobby-join')
  }

  private onMessage(payload: unknown): void {
    if (!this.active) {
      return
    }
    const message = decodeNetMessage(payload)
    if (message === null) {
      return
    }

    if (message.type === 'init') {
      this.match.start(
        'online-guest',
        message.firstPlayer === 1 ? 2 : 1,
        message.firstPlayer,
      )
      this.showView('game')
      this.initCanvasIfNeeded()
      this.renderBoard()
      return
    }

    this.match.receiveMessage(message)
  }

  private initCanvasIfNeeded(): void {
    if (this.boardRenderer !== null && this.overlayRenderer !== null) {
      this.resize()
      return
    }

    const boardCanvas = this.canvas('centurion-board-canvas')
    const overlayCanvas = this.canvas('centurion-overlay-canvas')
    this.boardRenderer = new BoardRenderer(boardCanvas)
    this.overlayRenderer = new OverlayRenderer(overlayCanvas)

    boardCanvas.addEventListener('click', (event) => this.onBoardClick(event))
    boardCanvas.addEventListener(
      'touchstart',
      (event) => this.onBoardTouch(event),
      { passive: false },
    )

    this.resize()
  }

  private resize(): void {
    const boardWrap = this.element('centurion-board-wrap')
    const available = Math.min(
      boardWrap.clientWidth,
      boardWrap.clientHeight,
      640,
    )
    this.boardRenderer?.resize(available)
    this.overlayRenderer?.resize(available)
  }

  private onBoardClick(event: MouseEvent): void {
    if (this.boardRenderer === null) {
      return
    }
    const coord = this.boardRenderer.pixelToCoord(event.clientX, event.clientY)
    if (coord !== null) {
      this.match.handleClick(coord)
    }
  }

  private onBoardTouch(event: TouchEvent): void {
    event.preventDefault()
    if (this.boardRenderer === null) {
      return
    }
    const touch = event.touches[0]
    if (touch === undefined) {
      return
    }
    const coord = this.boardRenderer.pixelToCoord(touch.clientX, touch.clientY)
    if (coord !== null) {
      this.match.handleClick(coord)
    }
  }

  private renderBoard(): void {
    if (!this.active || this.currentView() !== 'game') {
      return
    }
    if (this.boardRenderer === null || this.overlayRenderer === null) {
      return
    }
    this.boardRenderer.render(
      this.match.games,
      this.match.currentPlayer,
      this.match.viewPlayer,
      this.match.selectedSquare,
      this.match.viewMode,
    )
    this.overlayRenderer.render(
      this.match.arrows,
      this.match.currentPlayer,
      this.match.selectedSquare,
    )
  }

  private showGameOver(result: MatchResult): void {
    if (!this.active) {
      return
    }

    const overlay = this.element('centurion-game-over')
    const title = this.element('centurion-go-title')
    const sub = this.element('centurion-go-sub')

    if (result.scores[0] > result.scores[1]) {
      title.textContent = 'Player 1 Wins!'
      title.style.color = '#98c379'
    } else if (result.scores[1] > result.scores[0]) {
      title.textContent = 'Player 2 Wins!'
      title.style.color = '#e06c75'
    } else {
      title.textContent = 'Match Drawn'
      title.style.color = '#f1f1f1'
    }

    sub.textContent = `${result.scores[0]} - ${result.scores[1]} · ${result.gamesPlayed} games completed`
    overlay.style.display = 'flex'
  }

  private hideGameOver(): void {
    this.element('centurion-game-over').style.display = 'none'
  }

  private showView(view: CenturionView): void {
    const allViews: readonly CenturionView[] = [
      'start',
      'lobby-create',
      'lobby-join',
      'game',
    ]
    for (const entry of allViews) {
      const element = this.element(`centurion-view-${entry}`)
      element.style.display = entry === view ? 'flex' : 'none'
    }
  }

  private currentView(): CenturionView {
    const allViews: readonly CenturionView[] = [
      'start',
      'lobby-create',
      'lobby-join',
      'game',
    ]
    for (const entry of allViews) {
      const element = this.element(`centurion-view-${entry}`)
      if (element.style.display === 'flex') {
        return entry
      }
    }
    return 'start'
  }

  private updateCreateLobby(code: string, status: ConnectionStatus): void {
    this.element('centurion-room-code-display').textContent = code
    const statusElement = this.element('centurion-create-status')
    switch (status) {
      case 'waiting':
        statusElement.textContent = 'Waiting for opponent...'
        statusElement.className = 'centurion-lobby-status waiting'
        break
      case 'connected':
        statusElement.textContent = 'Opponent connected.'
        statusElement.className = 'centurion-lobby-status connected'
        break
      case 'error':
        statusElement.textContent = 'Connection error. Try again.'
        statusElement.className = 'centurion-lobby-status error'
        break
      default:
        statusElement.textContent = 'Connecting...'
        statusElement.className = 'centurion-lobby-status'
        break
    }
  }

  private updateJoinLobby(status: ConnectionStatus): void {
    const statusElement = this.element('centurion-join-status')
    const joinButton = this.button('centurion-join-btn')
    switch (status) {
      case 'connecting':
        statusElement.textContent = 'Connecting...'
        statusElement.className = 'centurion-lobby-status'
        joinButton.disabled = true
        break
      case 'connected':
        statusElement.textContent = 'Connected.'
        statusElement.className = 'centurion-lobby-status connected'
        joinButton.disabled = true
        break
      case 'error':
        statusElement.textContent = 'Could not connect. Check the room code.'
        statusElement.className = 'centurion-lobby-status error'
        joinButton.disabled = false
        break
      case 'disconnected':
        statusElement.textContent = 'Disconnected.'
        statusElement.className = 'centurion-lobby-status'
        joinButton.disabled = false
        break
      default:
        statusElement.textContent = ''
        statusElement.className = 'centurion-lobby-status'
        joinButton.disabled = false
        break
    }
  }

  private async shareRoomCode(code: string): Promise<void> {
    const url = window.location.href
    const text = `Join my Centurion Match room. Code: ${code}`

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Centurion Match', text, url })
        return
      } catch (_error: unknown) {
        // Fall through to clipboard.
      }
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      const button = this.button('centurion-share-btn')
      const original = button.textContent
      button.textContent = 'Copied!'
      window.setTimeout(() => {
        button.textContent = original
      }, 1400)
    } catch (_error: unknown) {
      window.prompt('Share this room code:', code)
    }
  }

  private element(id: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(`#${id}`)
    if (element === null) {
      throw new Error(`Missing centurion element: #${id}`)
    }
    return element
  }

  private button(id: string): HTMLButtonElement {
    const element = this.element(id)
    if (!(element instanceof HTMLButtonElement)) {
      throw new Error(`Expected button for #${id}`)
    }
    return element
  }

  private input(id: string): HTMLInputElement {
    const element = this.element(id)
    if (!(element instanceof HTMLInputElement)) {
      throw new Error(`Expected input for #${id}`)
    }
    return element
  }

  private canvas(id: string): HTMLCanvasElement {
    const element = this.element(id)
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error(`Expected canvas for #${id}`)
    }
    return element
  }
}
