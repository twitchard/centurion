import './styles.css'

import { PeerConnection } from './net/connection'
import type { ConnectionStatus } from './net/types'
import { BoardRenderer } from './render/board'
import { OverlayRenderer } from './render/overlay'
import { MatchState } from './state/match'
import type { MatchResult, NetMessage, PlayerNumber } from './state/types'
import { showGameOver } from './ui/game-over'
import { shareRoomCode, updateCreateLobby, updateJoinLobby } from './ui/lobby'
import { showScreen } from './ui/screens'

// ── Rendering ──

let boardRenderer: BoardRenderer
let overlayRenderer: OverlayRenderer

function initCanvas(): void {
  const bc = document.getElementById('bc') as HTMLCanvasElement
  const ov = document.getElementById('ov') as HTMLCanvasElement
  boardRenderer = new BoardRenderer(bc)
  overlayRenderer = new OverlayRenderer(ov)
  resize()
  window.addEventListener('resize', () => {
    resize()
    render()
  })
  bc.addEventListener('click', onBoardClick)
  bc.addEventListener('touchstart', onBoardTouch, { passive: false })
}

function resize(): void {
  const wrap = document.querySelector('.board-wrap') as HTMLElement
  const available = Math.min(wrap.clientWidth, wrap.clientHeight, 600)
  boardRenderer.resize(available)
  overlayRenderer.resize(available)
}

function render(): void {
  boardRenderer.render(
    match.games,
    match.currentPlayer,
    match.viewPlayer,
    match.selectedSquare,
    match.viewMode,
  )
  overlayRenderer.render(
    match.arrows,
    match.currentPlayer,
    match.selectedSquare,
  )
}

function onBoardClick(e: MouseEvent): void {
  const coord = boardRenderer.pixelToCoord(e.clientX, e.clientY)
  if (coord) match.handleClick(coord)
}

function onBoardTouch(e: TouchEvent): void {
  e.preventDefault()
  const t = e.touches[0]
  const coord = boardRenderer.pixelToCoord(t.clientX, t.clientY)
  if (coord) match.handleClick(coord)
}

// ── State ──

const match = new MatchState({
  onStateChange: () => render(),
  onResolving: () => {},
  onResolved: () => {},
  onGameOver: (result: MatchResult) => showGameOver(result),
  onSendMessage: (msg: NetMessage) => connection.send(msg),
})

// ── Networking ──

const connection = new PeerConnection({
  onStatusChange: (status: ConnectionStatus) => {
    if (connection.isHost) {
      updateCreateLobby(connection.code, status)
    } else {
      updateJoinLobby(status)
    }
  },
  onPeerJoin: () => {
    if (connection.isHost) {
      const firstPlayer: PlayerNumber = Math.random() < 0.5 ? 1 : 2
      match.start('online-host', 1, firstPlayer)
      connection.send({ type: 'init', firstPlayer })
      showScreen('game')
      initCanvas()
      render()
    }
  },
  onPeerLeave: () => {},
  onMessage: (data: unknown) => {
    const msg = data as NetMessage

    if (msg.type === 'init') {
      match.start(
        'online-guest',
        msg.firstPlayer === 1 ? 2 : 1,
        msg.firstPlayer,
      )
      showScreen('game')
      initCanvas()
      render()
      return
    }

    match.receiveMessage(msg)
  },
})

// ── UI Event Binding ──

function bindEvents(): void {
  document.getElementById('btn-pass-play')?.addEventListener('click', () => {
    match.start('pass-and-play', 1)
    showScreen('game')
    initCanvas()
    render()
  })

  document.getElementById('btn-create-room')?.addEventListener('click', () => {
    const code = connection.createRoom()
    showScreen('lobby-create')
    updateCreateLobby(code, 'waiting')
  })

  document.getElementById('btn-join-room')?.addEventListener('click', () => {
    showScreen('lobby-join')
    const input = document.getElementById('code-input') as HTMLInputElement
    input?.focus()
  })

  document.getElementById('share-btn')?.addEventListener('click', () => {
    shareRoomCode(connection.code)
  })

  document.getElementById('create-back')?.addEventListener('click', () => {
    connection.disconnect()
    showScreen('start')
  })

  document.getElementById('join-btn')?.addEventListener('click', () => {
    const input = document.getElementById('code-input') as HTMLInputElement
    const code = input.value.trim()
    if (code.length === 6 && /^\d{6}$/.test(code)) {
      connection.joinRoom(code)
    }
  })

  document.getElementById('code-input')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      document.getElementById('join-btn')?.click()
    }
  })

  document.getElementById('join-back')?.addEventListener('click', () => {
    connection.disconnect()
    showScreen('start')
  })

  document.getElementById('pass-btn')?.addEventListener('click', () => {
    match.pass()
  })

  document.getElementById('new-match-btn')?.addEventListener('click', () => {
    connection.disconnect()
    location.reload()
  })
}

// ── Init ──

showScreen('start')
bindEvents()
