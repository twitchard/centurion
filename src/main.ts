import './styles.css'

import { StockfishEngineAdapter } from './adapters/stockfish-engine'
import { TrysteroTransportAdapter } from './adapters/trystero-transport'
import {
  type AppCmd,
  type AppMsg,
  type AppState,
  initAppState,
} from './app/model'
import { updateApp } from './app/update'
import {
  type MatchState,
  type PlayerId,
  activeGameCount,
  activePlacer,
  sideToMove,
} from './core/match/model'
import {
  matchRenderModel,
  squareName,
  toCanonicalSquare,
} from './core/match/render'
import { ENGINE_DEPTH } from './core/match/resolve'
import type { ParseResult } from './core/parsing/types'
import { assertNever } from './core/update'
import type {
  CenturionModel,
  MatchSession,
} from './features/centurion-match/model'
import { sessionViewer } from './features/centurion-match/model'
import {
  type CenturionMsg,
  LOBBY_COPY,
} from './features/centurion-match/update'
import type {
  ChatConnectionState,
  ChatLabModel,
  ChatLine,
} from './features/chat-lab/model'
import type { SuperpositionLabModel } from './features/superposition-lab/model'
import { SuperpositionRenderer } from './features/superposition-lab/render-superposition'

function element(id: string): HTMLElement {
  const node = document.getElementById(id)
  if (node === null) {
    throw new Error(`Missing #${id}`)
  }
  return node
}

function button(id: string): HTMLButtonElement {
  const node = element(id)
  if (!(node instanceof HTMLButtonElement)) {
    throw new Error(`Expected button for #${id}`)
  }
  return node
}

function input(id: string): HTMLInputElement {
  const node = element(id)
  if (!(node instanceof HTMLInputElement)) {
    throw new Error(`Expected input for #${id}`)
  }
  return node
}

function textarea(id: string): HTMLTextAreaElement {
  const node = element(id)
  if (!(node instanceof HTMLTextAreaElement)) {
    throw new Error(`Expected textarea for #${id}`)
  }
  return node
}

function canvas(id: string): HTMLCanvasElement {
  const node = element(id)
  if (!(node instanceof HTMLCanvasElement)) {
    throw new Error(`Expected canvas for #${id}`)
  }
  return node
}

const screenLabsMenu = element('screen-labs-menu')
const screenSuperposition = element('screen-superposition-lab')
const screenChat = element('screen-chat-lab')
const screenCenturion = element('screen-centurion-match')

const superpositionFenInput = textarea('superposition-fen-input')
const superpositionArrowInput = textarea('superposition-arrow-input')
const superpositionFenDiagnostics = element('superposition-fen-diagnostics')
const superpositionArrowDiagnostics = element('superposition-arrow-diagnostics')
const superpositionBoardPanel = element('superposition-board-panel')
const superpositionCanvas = canvas('superposition-canvas')
const superpositionRenderer = new SuperpositionRenderer(superpositionCanvas)

const chatJoinCodeInput = input('chat-join-code-input')
const chatDraftInput = input('chat-draft-input')
const chatRoomCode = element('chat-room-code')
const chatStatus = element('chat-status')
const chatLog = element('chat-log')
const chatCreateRoomButton = button('chat-create-room-btn')
const chatJoinRoomButton = button('chat-join-room-btn')
const chatDisconnectButton = button('chat-disconnect-btn')
const chatSendButton = button('chat-send-btn')

const centurionLobby = element('centurion-lobby')
const centurionSession = element('centurion-session')
const centurionStatusCopy = element('centurion-status-copy')
const centurionSoloButton = button('centurion-solo-btn')
const centurionPassAndPlayButton = button('centurion-pass-and-play-btn')
const centurionNewMatchButton = button('centurion-new-match-btn')
const centurionJoinCodeInput = input('centurion-join-code-input')
const centurionJoinMatchButton = button('centurion-join-match-btn')
const centurionCancelButton = button('centurion-cancel-btn')
const centurionShareRow = element('centurion-share-row')
const centurionShareButton = button('centurion-share-btn')
const centurionCopyLinkButton = button('centurion-copy-link-btn')
const centurionScoreLine = element('centurion-score-line')
const centurionActiveLine = element('centurion-active-line')
const centurionTurnLine = element('centurion-turn-line')
const centurionSessionNotice = element('centurion-session-notice')
const centurionResultBanner = element('centurion-result-banner')
const centurionArrowInput = input('centurion-arrow-input')
const centurionBoardHint = element('centurion-board-hint')
const centurionSubmitArrowButton = button('centurion-submit-arrow-btn')
const centurionResolutionSummary = element('centurion-resolution-summary')
const centurionArrowHistory = element('centurion-arrow-history')
const centurionLeaveButton = button('centurion-leave-btn')
const centurionBoardPanel = element('centurion-board-panel')
const centurionCanvas = canvas('centurion-canvas')
const centurionRenderer = new SuperpositionRenderer(centurionCanvas)

const chatTransport = new TrysteroTransportAdapter()
const centurionTransport = new TrysteroTransportAdapter(
  'centurion-chess-match-v1',
)
const centurionEngine = new StockfishEngineAdapter()

const JOIN_TIMEOUT_MS = 25_000
let joinTimer: ReturnType<typeof setTimeout> | null = null

function clearJoinTimer(): void {
  if (joinTimer !== null) {
    clearTimeout(joinTimer)
    joinTimer = null
  }
}

function armJoinTimer(code: string): void {
  clearJoinTimer()
  joinTimer = setTimeout(() => {
    joinTimer = null
    dispatchCenturion({ tag: 'join-timed-out', code })
  }, JOIN_TIMEOUT_MS)
}

let state: AppState = initAppState()

function dispatch(msg: AppMsg): void {
  const [nextState, commands] = updateApp(state, msg)
  state = nextState
  render()
  for (const command of commands) {
    runCommand(command)
  }
}

function dispatchCenturion(msg: CenturionMsg): void {
  dispatch({ tag: 'centurion-msg', msg })
}

function navigate(path: string, pushState = true): void {
  if (pushState) {
    window.history.pushState({}, '', path)
  }
  dispatch({ tag: 'navigate', path })
}

function newSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0
}

/**
 * The path the app is served from, with a trailing slash. On GitHub
 * Pages project sites this is e.g. /centurion/, so routes and invite
 * links must be built relative to it rather than the origin root.
 */
function appBasePath(): string {
  let path = window.location.pathname
  if (path.endsWith('/index.html')) {
    path = path.slice(0, -'index.html'.length)
  }
  if (path.endsWith('/labs')) {
    path = path.slice(0, -'labs'.length)
  }
  return path.endsWith('/') ? path : `${path}/`
}

function labsPath(): string {
  return `${appBasePath()}labs`
}

function inviteUrl(code: string): string {
  return `${window.location.origin}${appBasePath()}?join=${code}`
}

function canShareInvites(): boolean {
  return (
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  )
}

function shareInvite(code: string): void {
  if (!canShareInvites()) {
    copyInvite(code)
    return
  }
  navigator
    .share({
      title: 'Centurion Chess',
      text: `Join my Centurion Chess match - code ${code}`,
      url: inviteUrl(code),
    })
    .catch(() => {
      // Cancelled share sheets are not an error worth surfacing.
    })
}

function copyInvite(code: string): void {
  if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
    dispatchCenturion({ tag: 'invite-copy-failed' })
    return
  }
  navigator.clipboard.writeText(inviteUrl(code)).then(
    () => {
      dispatchCenturion({ tag: 'invite-copy-succeeded' })
    },
    () => {
      dispatchCenturion({ tag: 'invite-copy-failed' })
    },
  )
}

chatTransport.setCallbacks({
  onStatusChange: (status) => {
    dispatch({
      tag: 'chat-lab-msg',
      msg: {
        tag: 'transport-status-changed',
        status,
        code: chatTransport.code,
        isHost: chatTransport.isHost,
      },
    })
  },
  onPeerJoin: () => {
    dispatch({
      tag: 'chat-lab-msg',
      msg: { tag: 'transport-peer-joined' },
    })
  },
  onPeerLeave: () => {
    dispatch({
      tag: 'chat-lab-msg',
      msg: { tag: 'transport-peer-left' },
    })
  },
  onMessage: (data: unknown) => {
    dispatch({
      tag: 'chat-lab-msg',
      msg: { tag: 'transport-message-received', payload: data },
    })
  },
})

centurionTransport.setCallbacks({
  onStatusChange: (status) => {
    dispatchCenturion({
      tag: 'transport-status-changed',
      status,
      code: centurionTransport.code,
      isHost: centurionTransport.isHost,
    })
  },
  onPeerJoin: () => {
    dispatchCenturion({ tag: 'transport-peer-joined', seed: newSeed() })
  },
  onPeerLeave: () => {
    dispatchCenturion({ tag: 'transport-peer-left' })
  },
  onMessage: (data: unknown) => {
    dispatchCenturion({ tag: 'transport-message-received', payload: data })
  },
})

function runCommand(command: AppCmd): void {
  switch (command.tag) {
    case 'chat-lab':
      switch (command.cmd.tag) {
        case 'transport-create-room':
          chatTransport.createRoom()
          return
        case 'transport-join-room':
          chatTransport.joinRoom(command.cmd.code)
          return
        case 'transport-disconnect':
          chatTransport.disconnect()
          return
        case 'transport-send':
          chatTransport.send(command.cmd.payload)
          return
        default:
          assertNever(command.cmd)
          return
      }
    case 'centurion':
      switch (command.cmd.tag) {
        case 'transport-create-room':
          clearJoinTimer()
          centurionTransport.createRoom()
          return
        case 'transport-join-room':
          armJoinTimer(command.cmd.code)
          centurionTransport.joinRoom(command.cmd.code)
          return
        case 'transport-disconnect':
          clearJoinTimer()
          centurionTransport.disconnect()
          return
        case 'transport-send':
          centurionTransport.send(command.cmd.payload)
          return
        case 'share-invite':
          shareInvite(command.cmd.code)
          return
        case 'copy-invite':
          copyInvite(command.cmd.code)
          return
        case 'compute-engine-moves':
          centurionEngine.bestMoves(command.cmd.fens, ENGINE_DEPTH).then(
            (moves) => {
              dispatchCenturion({ tag: 'engine-moves-computed', moves })
            },
            (error: unknown) => {
              dispatchCenturion({
                tag: 'engine-moves-failed',
                message: error instanceof Error ? error.message : String(error),
              })
            },
          )
          return
        default:
          assertNever(command.cmd)
          return
      }
    default:
      assertNever(command)
      return
  }
}

function setScreenVisibility(screen: AppState['tag']): void {
  screenLabsMenu.style.display = screen === 'labs-menu' ? 'flex' : 'none'
  screenSuperposition.style.display =
    screen === 'superposition-lab' ? 'flex' : 'none'
  screenChat.style.display = screen === 'chat-lab' ? 'flex' : 'none'
  screenCenturion.style.display = screen === 'centurion-match' ? 'flex' : 'none'
}

function renderDiagnostics(
  target: HTMLElement,
  result: ParseResult<readonly unknown[]>,
  okMessage: string,
): void {
  target.innerHTML = ''
  if (result.tag === 'valid') {
    const line = document.createElement('li')
    line.className = 'diagnostic-ok'
    line.textContent = okMessage
    target.appendChild(line)
    return
  }

  for (const diagnostic of result.diagnostics) {
    const line = document.createElement('li')
    line.className = 'diagnostic-error'
    line.textContent = diagnostic
    target.appendChild(line)
  }
}

function panelBoardSize(panel: HTMLElement): number {
  return Math.min(
    panel.clientWidth,
    panel.clientHeight > 0 ? panel.clientHeight : panel.clientWidth,
    720,
  )
}

function renderSuperpositionLab(model: SuperpositionLabModel): void {
  if (superpositionFenInput.value !== model.fenInput) {
    superpositionFenInput.value = model.fenInput
  }
  if (superpositionArrowInput.value !== model.arrowInput) {
    superpositionArrowInput.value = model.arrowInput
  }

  renderDiagnostics(
    superpositionFenDiagnostics,
    model.fenParse,
    `Parsed ${model.renderModel.positionCount} board position(s).`,
  )
  renderDiagnostics(
    superpositionArrowDiagnostics,
    model.arrowParse,
    model.arrowParse.tag === 'valid'
      ? `Parsed ${model.arrowParse.value.length} arrow(s).`
      : 'Arrow parsing failed.',
  )

  superpositionRenderer.resize(panelBoardSize(superpositionBoardPanel))
  superpositionRenderer.render(model.renderModel)
}

function chatConnectionSummary(connection: ChatConnectionState): string {
  switch (connection.tag) {
    case 'disconnected':
      return 'Disconnected'
    case 'connecting':
      return `Connecting as ${connection.role}...`
    case 'waiting':
      return `Waiting for peer in room ${connection.code}`
    case 'connected':
      return `Connected (${connection.role}) in room ${connection.code}`
    case 'error':
      return connection.message
    default:
      return assertNever(connection)
  }
}

function roomCodeFromConnection(connection: ChatConnectionState): string {
  switch (connection.tag) {
    case 'waiting':
    case 'connected':
      return connection.code
    case 'error':
      return connection.code ?? '------'
    default:
      return '------'
  }
}

function renderChatLine(line: ChatLine): HTMLLIElement {
  const item = document.createElement('li')
  item.className = `chat-line chat-line--${line.author}`
  item.textContent = line.text
  return item
}

function renderChatLab(model: ChatLabModel): void {
  if (chatJoinCodeInput.value !== model.joinCodeInput) {
    chatJoinCodeInput.value = model.joinCodeInput
  }
  if (chatDraftInput.value !== model.draft) {
    chatDraftInput.value = model.draft
  }

  chatStatus.textContent = chatConnectionSummary(model.connection)
  chatRoomCode.textContent = roomCodeFromConnection(model.connection)

  chatLog.innerHTML = ''
  for (const line of model.transcript) {
    chatLog.appendChild(renderChatLine(line))
  }
  chatLog.scrollTop = chatLog.scrollHeight

  const connected = model.connection.tag === 'connected'
  const waiting = model.connection.tag === 'waiting'
  const connecting = model.connection.tag === 'connecting'

  chatCreateRoomButton.disabled = connected || waiting || connecting
  chatJoinRoomButton.disabled = connected || waiting || connecting
  chatDisconnectButton.disabled = model.connection.tag === 'disconnected'
  chatSendButton.disabled = !connected || model.draft.trim().length === 0
}

function playerColorName(player: PlayerId): string {
  return player === 1 ? 'green' : 'red'
}

function playerLabel(session: MatchSession, player: PlayerId): string {
  if (session.mode.tag === 'solo') {
    return player === 1 ? 'You (green)' : 'The field'
  }
  const base = `Player ${player} (${playerColorName(player)})`
  if (session.mode.tag === 'remote' && session.mode.you === player) {
    return `${base} (you)`
  }
  return base
}

function describePlacer(session: MatchSession): string {
  const match = session.match
  if (session.resolving !== null) {
    return `Turn ${match.turn}: Stockfish (depth ${ENGINE_DEPTH}) is resolving ${session.resolving.pending.length} game(s)...`
  }
  if (session.mode.tag === 'solo') {
    return `Turn ${match.turn}: place an arrow, then both half-moves play out.`
  }
  const placer = activePlacer(match)
  const color = sideToMove(match)
  const who =
    session.mode.tag === 'remote'
      ? placer === session.mode.you
        ? `You (${playerColorName(placer)}) place`
        : `Opponent (${playerColorName(placer)}) places`
      : `Player ${placer} (${playerColorName(placer)}) places`
  return `Turn ${match.turn}: ${who} an arrow, then all games advance (${color} to move).`
}

function describeResult(session: MatchSession, match: MatchState): string {
  if (match.phase.tag !== 'finished') {
    return ''
  }
  const winner = match.phase.winner
  if (winner === 'draw') {
    return `Match drawn ${match.scores.p1} : ${match.scores.p2}.`
  }
  if (session.mode.tag === 'remote') {
    return winner === session.mode.you
      ? `You win the match ${match.scores.p1} : ${match.scores.p2}!`
      : `${playerLabel(session, winner)} wins ${match.scores.p1} : ${match.scores.p2}.`
  }
  return `Player ${winner} wins the match ${match.scores.p1} : ${match.scores.p2}!`
}

function resolutionSummaryText(match: MatchState): string {
  const summary = match.lastResolution
  if (summary === null) {
    return 'No turns resolved yet.'
  }
  const base = `Turn ${summary.turn}: ${summary.arrowMoves} game(s) followed arrows, ${summary.engineMoves} played engine moves.`
  const decided = summary.p1Wins + summary.p2Wins + summary.draws
  if (decided === 0) {
    return base
  }
  return `${base} Decided: P1 +${summary.p1Wins}, P2 +${summary.p2Wins}, draws +${summary.draws}.`
}

function boardHintText(session: MatchSession): string {
  const match = session.match
  if (match.phase.tag === 'finished') {
    return 'Match over.'
  }
  if (session.inputError !== null) {
    return session.inputError
  }
  if (session.resolving !== null) {
    return `Stockfish is resolving ${session.resolving.pending.length} game(s)...`
  }
  if (
    session.mode.tag === 'remote' &&
    activePlacer(match) !== session.mode.you
  ) {
    return 'Waiting for your opponent...'
  }
  if (session.selectedSquare !== null) {
    return `From ${squareName(session.selectedSquare)} - now tap the destination.`
  }
  const placer =
    session.mode.tag === 'local'
      ? `Player ${activePlacer(match)} (${playerColorName(activePlacer(match))})`
      : 'You'
  return `${placer}: tap the origin square of your arrow.`
}

function renderCenturionSession(session: MatchSession): void {
  const match = session.match
  const viewer = sessionViewer(session)

  centurionScoreLine.textContent = `${playerLabel(session, 1)} ${match.scores.p1} : ${match.scores.p2} ${playerLabel(session, 2)}`
  centurionActiveLine.textContent = `${activeGameCount(match)} of ${match.gameCount} games active`
  centurionTurnLine.textContent =
    match.phase.tag === 'finished' ? 'Match over.' : describePlacer(session)

  centurionSessionNotice.textContent = session.notice ?? ''
  centurionBoardHint.textContent = boardHintText(session)

  const result = describeResult(session, match)
  centurionResultBanner.textContent = result
  centurionResultBanner.style.display = result.length > 0 ? 'block' : 'none'

  if (centurionArrowInput.value !== session.arrowInput) {
    centurionArrowInput.value = session.arrowInput
  }

  const yourTurn =
    session.mode.tag !== 'remote' || activePlacer(match) === session.mode.you
  centurionSubmitArrowButton.disabled =
    match.phase.tag === 'finished' || !yourTurn || session.resolving !== null

  centurionResolutionSummary.textContent = resolutionSummaryText(match)

  centurionArrowHistory.innerHTML = ''
  for (const placed of [...match.arrows].reverse()) {
    const item = document.createElement('li')
    item.className = `centurion-arrow-entry centurion-arrow-entry--player-${placed.placedBy}`
    const from = squareName(toCanonicalSquare(viewer, placed.arrow.from))
    const to = squareName(toCanonicalSquare(viewer, placed.arrow.to))
    item.textContent = `T${placed.turn} P${placed.placedBy}: ${from}->${to}`
    centurionArrowHistory.appendChild(item)
  }

  centurionRenderer.resize(panelBoardSize(centurionBoardPanel))
  centurionRenderer.render(
    matchRenderModel(match, viewer, session.selectedSquare, session.resolving),
  )
}

function renderCenturion(model: CenturionModel): void {
  const inSession = model.tag === 'playing'
  centurionLobby.style.display = inSession ? 'none' : 'flex'
  centurionSession.style.display = inSession ? 'grid' : 'none'

  if (model.tag === 'playing') {
    renderCenturionSession(model.session)
    return
  }

  const idle = model.tag === 'lobby'
  centurionSoloButton.disabled = !idle
  centurionPassAndPlayButton.disabled = !idle
  centurionNewMatchButton.disabled = !idle
  centurionJoinMatchButton.disabled = !idle || model.joinCodeInput.length !== 6
  centurionCancelButton.style.display = idle ? 'none' : 'block'
  centurionShareRow.style.display = model.tag === 'waiting' ? 'grid' : 'none'
  centurionShareButton.style.display = canShareInvites() ? 'block' : 'none'

  switch (model.tag) {
    case 'lobby':
      centurionStatusCopy.textContent = model.notice ?? LOBBY_COPY
      if (centurionJoinCodeInput.value !== model.joinCodeInput) {
        centurionJoinCodeInput.value = model.joinCodeInput
      }
      return
    case 'connecting':
      centurionStatusCopy.textContent =
        model.role === 'host'
          ? 'Creating match...'
          : `Joining match ${model.code}...`
      return
    case 'waiting': {
      const base = `New match created. Share code ${model.code} to invite your opponent.`
      centurionStatusCopy.textContent =
        model.notice === null ? base : `${base} ${model.notice}`
      return
    }
    case 'syncing':
      centurionStatusCopy.textContent =
        'Connected. Waiting for the host to start the match...'
      return
    default:
      assertNever(model)
  }
}

function render(): void {
  setScreenVisibility(state.tag)

  if (state.tag === 'superposition-lab') {
    renderSuperpositionLab(state.model)
    return
  }

  if (state.tag === 'chat-lab') {
    renderChatLab(state.model)
    return
  }

  if (state.tag === 'centurion-match') {
    renderCenturion(state.model)
    return
  }
}

function centurionSquareFromClick(event: MouseEvent): number | null {
  const rect = centurionCanvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return null
  }
  const col = Math.floor(((event.clientX - rect.left) / rect.width) * 8)
  const rowFromTop = Math.floor(((event.clientY - rect.top) / rect.height) * 8)
  if (col < 0 || col > 7 || rowFromTop < 0 || rowFromTop > 7) {
    return null
  }
  return (7 - rowFromTop) * 8 + col
}

function bindEvents(): void {
  button('labs-menu-open-superposition').addEventListener('click', () => {
    dispatch({ tag: 'open-superposition-lab' })
  })
  button('labs-menu-open-chat').addEventListener('click', () => {
    dispatch({ tag: 'open-chat-lab' })
  })
  button('labs-menu-open-centurion').addEventListener('click', () => {
    dispatch({ tag: 'open-centurion-match' })
  })
  button('labs-menu-back-btn').addEventListener('click', () => {
    navigate(appBasePath())
  })

  button('superposition-back-btn').addEventListener('click', () => {
    navigate(labsPath())
  })
  button('superposition-reset-btn').addEventListener('click', () => {
    dispatch({
      tag: 'superposition-lab-msg',
      msg: { tag: 'reset-fixtures-requested' },
    })
  })
  superpositionFenInput.addEventListener('input', (event) => {
    dispatch({
      tag: 'superposition-lab-msg',
      msg: {
        tag: 'fen-input-updated',
        value: (event.target as HTMLTextAreaElement).value,
      },
    })
  })
  superpositionArrowInput.addEventListener('input', (event) => {
    dispatch({
      tag: 'superposition-lab-msg',
      msg: {
        tag: 'arrow-input-updated',
        value: (event.target as HTMLTextAreaElement).value,
      },
    })
  })

  button('chat-back-btn').addEventListener('click', () => {
    navigate(labsPath())
  })
  chatCreateRoomButton.addEventListener('click', () => {
    dispatch({
      tag: 'chat-lab-msg',
      msg: { tag: 'create-room-requested' },
    })
  })
  chatJoinRoomButton.addEventListener('click', () => {
    dispatch({
      tag: 'chat-lab-msg',
      msg: { tag: 'join-room-requested' },
    })
  })
  chatDisconnectButton.addEventListener('click', () => {
    dispatch({
      tag: 'chat-lab-msg',
      msg: { tag: 'disconnect-requested' },
    })
  })
  chatSendButton.addEventListener('click', () => {
    dispatch({
      tag: 'chat-lab-msg',
      msg: { tag: 'send-draft-requested' },
    })
  })
  chatJoinCodeInput.addEventListener('input', (event) => {
    dispatch({
      tag: 'chat-lab-msg',
      msg: {
        tag: 'join-code-updated',
        value: (event.target as HTMLInputElement).value,
      },
    })
  })
  chatDraftInput.addEventListener('input', (event) => {
    dispatch({
      tag: 'chat-lab-msg',
      msg: {
        tag: 'draft-updated',
        value: (event.target as HTMLInputElement).value,
      },
    })
  })
  chatDraftInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return
    }
    event.preventDefault()
    dispatch({
      tag: 'chat-lab-msg',
      msg: { tag: 'send-draft-requested' },
    })
  })

  button('centurion-back-btn').addEventListener('click', () => {
    navigate(labsPath())
  })
  centurionSoloButton.addEventListener('click', () => {
    dispatchCenturion({ tag: 'solo-requested', seed: newSeed() })
  })
  centurionPassAndPlayButton.addEventListener('click', () => {
    dispatchCenturion({ tag: 'pass-and-play-requested', seed: newSeed() })
  })
  centurionNewMatchButton.addEventListener('click', () => {
    dispatchCenturion({ tag: 'new-match-requested' })
  })
  centurionJoinMatchButton.addEventListener('click', () => {
    dispatchCenturion({ tag: 'join-match-requested' })
  })
  centurionCancelButton.addEventListener('click', () => {
    dispatchCenturion({ tag: 'leave-session-requested' })
  })
  centurionShareButton.addEventListener('click', () => {
    dispatchCenturion({ tag: 'share-invite-requested' })
  })
  centurionCopyLinkButton.addEventListener('click', () => {
    dispatchCenturion({ tag: 'copy-invite-requested' })
  })
  centurionJoinCodeInput.addEventListener('input', (event) => {
    dispatchCenturion({
      tag: 'join-code-updated',
      value: (event.target as HTMLInputElement).value,
    })
  })
  centurionArrowInput.addEventListener('input', (event) => {
    dispatchCenturion({
      tag: 'arrow-input-updated',
      value: (event.target as HTMLInputElement).value,
    })
  })
  centurionArrowInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return
    }
    event.preventDefault()
    dispatchCenturion({ tag: 'arrow-submit-requested' })
  })
  centurionSubmitArrowButton.addEventListener('click', () => {
    dispatchCenturion({ tag: 'arrow-submit-requested' })
  })
  centurionLeaveButton.addEventListener('click', () => {
    dispatchCenturion({ tag: 'leave-session-requested' })
  })
  centurionCanvas.addEventListener('click', (event) => {
    const square = centurionSquareFromClick(event as MouseEvent)
    if (square === null) {
      return
    }
    dispatchCenturion({ tag: 'board-square-clicked', square })
  })

  window.addEventListener('popstate', () => {
    navigate(window.location.pathname, false)
  })

  window.addEventListener('resize', () => {
    render()
  })
}

function autoJoinFromUrl(): void {
  const search: string | undefined = window.location.search
  if (search === undefined || search.length === 0) {
    return
  }
  const code = (new URLSearchParams(search).get('join') ?? '')
    .replace(/\D/g, '')
    .slice(0, 6)
  if (code.length !== 6) {
    return
  }
  window.history.replaceState({}, '', window.location.pathname)
  dispatchCenturion({ tag: 'join-code-updated', value: code })
  dispatchCenturion({ tag: 'join-match-requested' })
}

bindEvents()
navigate(window.location.pathname, false)
autoJoinFromUrl()
