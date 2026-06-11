import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.brown.css'
import 'chessground/assets/chessground.cburnett.css'
import './styles.css'

import {
  clearCenturionPersistence,
  loadCenturionPersistence,
  saveCenturionPersistence,
} from './adapters/local-storage-centurion-persistence'
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
  appendConnectionLog,
  clearConnectionLog,
  renderConnectionLog,
} from './connection-log'
import {
  type ResolutionAnimationPlan,
  planResolutionAnimation,
  resolutionAnimationFrame,
} from './core/match/animate'
import { decodeMatchWireMessage } from './core/match/codec'
import {
  ARROW_PLACEMENT_LAST_TURN,
  type MatchState,
  type PlayerId,
  activeGameCount,
  activePlacer,
  canPlaceArrows,
  sideToMove,
} from './core/match/model'
import {
  describeGameReplayLabel,
  gameMoveSourceCounts,
  gamesForReplaySelection,
  matchGameToPgn,
  replaySnapshot,
} from './core/match/pgn'
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
import { initCenturionModel } from './features/centurion-match/model'
import { sessionViewer } from './features/centurion-match/model'
import { encodeCenturionForPersistence } from './features/centurion-match/persistence'
import { ReplayBoard } from './features/centurion-match/replay-board'
import {
  type CenturionMsg,
  LOBBY_COPY,
  updateCenturion,
} from './features/centurion-match/update'
import type {
  ChatConnectionState,
  ChatLabModel,
  ChatLine,
} from './features/chat-lab/model'
import type { SuperpositionLabModel } from './features/superposition-lab/model'
import {
  type PieceDisplayMode,
  SuperpositionRenderer,
} from './features/superposition-lab/render-superposition'
import {
  type AppRoute,
  inviteUrl,
  pathnameToAppRoute,
  urlPathForRoute,
} from './routing'

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

const centurionBackButton = button('centurion-back-btn')
const centurionLabsFoot = element('centurion-labs-foot')
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
const centurionScoreP1 = element('centurion-score-p1')
const centurionScoreP2 = element('centurion-score-p2')
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
const centurionGameReplay = element('centurion-game-replay')
const centurionGameSelect = element(
  'centurion-game-select',
) as HTMLSelectElement
const centurionReplayBoardHost = element('centurion-replay-board')
const centurionReplayMoveInfo = element('centurion-replay-move-info')
const centurionReplayPgn = textarea('centurion-replay-pgn')
const centurionReplayStartButton = button('centurion-replay-start')
const centurionReplayPrevButton = button('centurion-replay-prev')
const centurionReplayNextButton = button('centurion-replay-next')
const centurionReplayEndButton = button('centurion-replay-end')
const centurionReplayBoard = new ReplayBoard(centurionReplayBoardHost)
let centurionGameReplayOptionsKey = ''
const centurionBoardPanel = element('centurion-board-panel')
const centurionCanvas = canvas('centurion-canvas')
const centurionRenderer = new SuperpositionRenderer(centurionCanvas)
const centurionConnectionLogList = element(
  'centurion-connection-log-list',
) as HTMLOListElement
const centurionConnectionLogClear = button('centurion-connection-log-clear')

// Pieces/Letters is a pure view preference shared by every board.
const displayModeButtons: ReadonlyArray<{
  readonly button: HTMLButtonElement
  readonly mode: PieceDisplayMode
}> = [
  { button: button('superposition-mode-pieces'), mode: 'pieces' },
  { button: button('superposition-mode-letters'), mode: 'letters' },
  { button: button('centurion-mode-pieces'), mode: 'pieces' },
  { button: button('centurion-mode-letters'), mode: 'letters' },
]

function applyPieceDisplayMode(mode: PieceDisplayMode): void {
  superpositionRenderer.displayMode = mode
  centurionRenderer.displayMode = mode
  for (const entry of displayModeButtons) {
    entry.button.classList.toggle('active', entry.mode === mode)
  }
}

const CENTURION_TRANSPORT_APP_ID = 'centurion-chess-match-v1'

const chatTransport = new TrysteroTransportAdapter()
const centurionTransport = new TrysteroTransportAdapter(
  CENTURION_TRANSPORT_APP_ID,
)
const centurionEngine = new StockfishEngineAdapter()

let state: AppState = initAppState()
let hostPendingSeed: number | null = null

function centurionRoomId(code: string): string {
  return `${CENTURION_TRANSPORT_APP_ID}-${code}`
}

function describeWirePayload(payload: unknown): string {
  const wire = decodeMatchWireMessage(payload)
  if (wire === null) {
    return 'unrecognized payload'
  }
  if (wire.type === 'centurion:start') {
    return `centurion:start seed=${wire.seed} games=${wire.gameCount}`
  }
  if (wire.type === 'centurion:auto') {
    return `centurion:auto turn=${wire.turn} moves=${wire.moves.length}`
  }
  if (wire.type === 'centurion:sync') {
    return `centurion:sync turn=${wire.snapshot.turn} games=${wire.snapshot.gameCount}`
  }
  return `centurion:arrow turn=${wire.turn} ${wire.from}->${wire.to} moves=${wire.moves.length}`
}

function logConnection(message: string): void {
  appendConnectionLog(message)
  renderConnectionLog(centurionConnectionLogList)
}

function persistCenturionState(): void {
  if (state.tag !== 'centurion-match') {
    return
  }
  const encoded = encodeCenturionForPersistence(state.model)
  if (encoded !== null) {
    saveCenturionPersistence(encoded)
  }
}

function dispatch(msg: AppMsg): void {
  if (state.tag === 'centurion-match') {
    persistCenturionState()
  }
  const prevCenturionTag =
    state.tag === 'centurion-match' ? state.model.tag : null
  const [nextState, commands] = updateApp(state, msg)
  state = nextState
  if (
    nextState.tag === 'centurion-match' &&
    prevCenturionTag !== null &&
    prevCenturionTag !== nextState.model.tag
  ) {
    logConnection(`State: ${prevCenturionTag} -> ${nextState.model.tag}`)
  }
  if (
    msg.tag === 'centurion-msg' &&
    msg.msg.tag === 'leave-session-requested'
  ) {
    hostPendingSeed = null
    clearCenturionPersistence()
  } else {
    persistCenturionState()
  }
  render()
  for (const command of commands) {
    runCommand(command)
  }
}

function dispatchCenturion(msg: CenturionMsg): void {
  switch (msg.tag) {
    case 'new-match-requested':
      logConnection('You requested a new multiplayer match (host).')
      break
    case 'join-match-requested':
      logConnection('You requested to join a match (guest).')
      break
    case 'leave-session-requested':
      hostPendingSeed = null
      logConnection('You left the multiplayer session.')
      break
    case 'restore-session-requested':
      logConnection('Restoring in-progress match from local storage.')
      break
    case 'share-invite-requested':
      logConnection('You opened the share sheet for the invite link.')
      break
    case 'copy-invite-requested':
      logConnection('You copied the invite link.')
      break
    default:
      break
  }
  dispatch({ tag: 'centurion-msg', msg })
}

function navigate(route: AppRoute, pushState = true): void {
  const path = urlPathForRoute(route)
  if (pushState) {
    window.history.pushState({}, '', path)
  }
  dispatch({ tag: 'navigate', route })
}

function newSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0
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
  onLog: (message) => {
    logConnection(message)
  },
  onStatusChange: (status) => {
    const role = centurionTransport.isHost ? 'host' : 'guest'
    const code = centurionTransport.code
    const room = code.length > 0 ? centurionRoomId(code) : '(no room code yet)'
    logConnection(
      `Trystero status: ${status} (${role}, code=${code || '—'}, room=${room})`,
    )
    let pendingSeed: number | undefined
    if (
      status === 'waiting' &&
      centurionTransport.isHost &&
      hostPendingSeed === null
    ) {
      hostPendingSeed = newSeed()
      pendingSeed = hostPendingSeed
    }
    dispatchCenturion({
      tag: 'transport-status-changed',
      status,
      code: centurionTransport.code,
      isHost: centurionTransport.isHost,
      ...(pendingSeed !== undefined && { pendingSeed }),
    })
  },
  onPeerJoin: () => {
    logConnection('Peer joined the Trystero room.')
    dispatchCenturion({ tag: 'transport-peer-joined' })
  },
  onPeerLeave: () => {
    logConnection('Peer left the Trystero room.')
    dispatchCenturion({ tag: 'transport-peer-left' })
  },
  onMessage: (data: unknown) => {
    logConnection(`Received: ${describeWirePayload(data)}`)
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
        case 'transport-create-room': {
          hostPendingSeed = null
          const code = centurionTransport.createRoom()
          logConnection(
            `Creating room as host (code=${code}, room=${centurionRoomId(code)}).`,
          )
          return
        }
        case 'transport-host-room':
          logConnection(
            `Re-opening room as host (code=${command.cmd.code}, room=${centurionRoomId(command.cmd.code)}).`,
          )
          centurionTransport.hostRoom(command.cmd.code)
          return
        case 'transport-join-room':
          logConnection(
            `Joining room as guest (code=${command.cmd.code}, room=${centurionRoomId(command.cmd.code)}).`,
          )
          centurionTransport.joinRoom(command.cmd.code)
          return
        case 'transport-disconnect':
          logConnection('Disconnecting from Trystero.')
          centurionTransport.disconnect()
          return
        case 'transport-send':
          logConnection(`Sending: ${describeWirePayload(command.cmd.payload)}`)
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
  return player === 1 ? 'gold' : 'crimson'
}

function playerLabel(session: MatchSession, player: PlayerId): string {
  if (session.mode.tag === 'solo') {
    return player === 1 ? 'You (gold)' : 'The field'
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
  if (!canPlaceArrows(match)) {
    return `Turn ${match.turn}: arrow placement closed after turn ${ARROW_PLACEMENT_LAST_TURN}; Stockfish is playing out the match.`
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
    return session.gameReplay === null
      ? 'Match over.'
      : 'Match over. Review a finished game below.'
  }
  if (session.inputError !== null) {
    return session.inputError
  }
  if (session.resolving !== null) {
    return `Stockfish is resolving ${session.resolving.pending.length} game(s)...`
  }
  if (!canPlaceArrows(match)) {
    return 'Arrow placement is closed; Stockfish is playing out the remaining games.'
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

function renderGameReplay(session: MatchSession): void {
  const match = session.match
  const replay = session.gameReplay
  const showReplay = match.phase.tag === 'finished' && replay !== null
  centurionGameReplay.hidden = !showReplay
  if (!showReplay || replay === null) {
    return
  }

  const selectedGame = match.games.find((game) => game.id === replay.gameId)
  if (selectedGame === undefined) {
    return
  }

  const sortedGames = gamesForReplaySelection(match.games)
  const optionsKey = sortedGames
    .map((game) => {
      const counts = gameMoveSourceCounts(game)
      return `${game.id}:${counts.arrow}:${counts.engine}:${game.moves.length}`
    })
    .join('|')
  if (centurionGameReplayOptionsKey !== optionsKey) {
    centurionGameReplayOptionsKey = optionsKey
    centurionGameSelect.innerHTML = ''
    for (const game of sortedGames) {
      const option = document.createElement('option')
      option.value = String(game.id)
      option.textContent = describeGameReplayLabel(game)
      centurionGameSelect.appendChild(option)
    }
  }
  centurionGameSelect.value = String(replay.gameId)

  const snapshot = replaySnapshot(selectedGame, replay.ply)
  centurionReplayBoard.setPosition(snapshot.fen, snapshot.lastMove)
  centurionReplayBoard.redraw()

  const sourceCounts = gameMoveSourceCounts(selectedGame)
  centurionReplayMoveInfo.textContent =
    snapshot.moveCount === 0
      ? 'No moves recorded for this game.'
      : `Ply ${snapshot.ply} of ${snapshot.moveCount} (${sourceCounts.arrow} arrow, ${sourceCounts.engine} engine)`

  centurionReplayPgn.value = matchGameToPgn(selectedGame, {
    white: playerLabel(session, selectedGame.whiteOwner),
    black: playerLabel(session, selectedGame.whiteOwner === 1 ? 2 : 1),
    round: String(selectedGame.id + 1),
  })

  centurionReplayStartButton.disabled = snapshot.ply === 0
  centurionReplayPrevButton.disabled = snapshot.ply === 0
  centurionReplayNextButton.disabled = snapshot.ply >= snapshot.moveCount
  centurionReplayEndButton.disabled = snapshot.ply >= snapshot.moveCount
}

/**
 * Resolution animation: when a settled turn lands, the board replays it
 * over ~2 seconds — arrow-pulled pieces slide with emphasis first, then
 * every engine move fades across in a stagger. Purely presentational:
 * game state is already final underneath.
 */
const RESOLUTION_ANIMATION_MS = 2000
const ANIMATION_QUEUE_LIMIT = 3

let centurionAnimationQueue: ResolutionAnimationPlan[] = []
let centurionAnimationStart: number | null = null
let centurionLastMatch: MatchState | null = null
let centurionAnimationRaf: number | null = null

function centurionAnimationsEnabled(): boolean {
  if (
    typeof requestAnimationFrame !== 'function' ||
    typeof performance === 'undefined'
  ) {
    return false
  }
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return false
  }
  return RESOLUTION_ANIMATION_MS > 0
}

function resetCenturionAnimation(): void {
  centurionAnimationQueue = []
  centurionAnimationStart = null
  centurionLastMatch = null
}

function maybeQueueResolutionAnimation(session: MatchSession): void {
  const match = session.match
  const previous = centurionLastMatch
  centurionLastMatch = match
  if (previous === null || previous === match) {
    return
  }
  if (!centurionAnimationsEnabled()) {
    return
  }
  const plan = planResolutionAnimation(
    previous,
    match,
    sessionViewer(session),
    RESOLUTION_ANIMATION_MS,
  )
  if (plan === null) {
    // Not a single-turn step (restore, sync, new match): drop any
    // stale animations and show the live board.
    centurionAnimationQueue = []
    centurionAnimationStart = null
    return
  }
  centurionAnimationQueue.push(plan)
  // If resolution outpaces playback, skip ahead rather than lag.
  while (centurionAnimationQueue.length > ANIMATION_QUEUE_LIMIT) {
    centurionAnimationQueue.shift()
    centurionAnimationStart = null
  }
}

/** Paint the current animation frame; false when nothing is animating. */
function renderCenturionAnimationFrame(session: MatchSession): boolean {
  for (;;) {
    const head = centurionAnimationQueue[0]
    if (head === undefined) {
      return false
    }
    const now = performance.now()
    if (centurionAnimationStart === null) {
      centurionAnimationStart = now
    }
    const elapsed = now - centurionAnimationStart
    if (elapsed >= head.totalMs) {
      centurionAnimationQueue.shift()
      centurionAnimationStart = null
      continue
    }
    const frame = resolutionAnimationFrame(
      head,
      elapsed,
      session.selectedSquare,
    )
    centurionRenderer.render(frame.model, frame.overlays)
    scheduleCenturionAnimationTick()
    return true
  }
}

function scheduleCenturionAnimationTick(): void {
  if (centurionAnimationRaf !== null) {
    return
  }
  centurionAnimationRaf = requestAnimationFrame(() => {
    centurionAnimationRaf = null
    if (state.tag !== 'centurion-match' || state.model.tag !== 'playing') {
      resetCenturionAnimation()
      return
    }
    const session = state.model.session
    if (!renderCenturionAnimationFrame(session)) {
      // Queue drained: settle the canvas on the live board.
      centurionRenderer.render(
        matchRenderModel(
          session.match,
          sessionViewer(session),
          session.selectedSquare,
          session.resolving,
        ),
      )
    }
  })
}

function renderCenturionSession(session: MatchSession): void {
  const match = session.match
  const viewer = sessionViewer(session)

  centurionScoreP1.textContent = `${playerLabel(session, 1)} ${match.scores.p1}`
  centurionScoreP2.textContent = `${match.scores.p2} ${playerLabel(session, 2)}`
  centurionActiveLine.textContent = `${activeGameCount(match)} of ${match.gameCount} games active`
  centurionTurnLine.textContent =
    match.phase.tag === 'finished' ? 'Match over.' : describePlacer(session)

  centurionSessionNotice.textContent = session.notice ?? ''
  centurionBoardHint.textContent = boardHintText(session)
  // The hint speaks for the active placer; wear their color.
  const hintPlacer =
    session.resolving === null && match.phase.tag === 'active'
      ? activePlacer(match)
      : null
  centurionBoardHint.style.color =
    hintPlacer === 1
      ? 'var(--gold-bright)'
      : hintPlacer === 2
        ? 'var(--crimson-text)'
        : ''

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
  for (const boardArrow of [...match.arrows].reverse()) {
    const item = document.createElement('li')
    item.className = `centurion-arrow-entry centurion-arrow-entry--player-${boardArrow.owner}`
    const from = squareName(toCanonicalSquare(viewer, boardArrow.from))
    const to = squareName(toCanonicalSquare(viewer, boardArrow.to))
    item.textContent = `T${boardArrow.placedTurn} P${boardArrow.owner}: ${from}->${to} (×${boardArrow.cardinality})`
    centurionArrowHistory.appendChild(item)
  }

  renderGameReplay(session)

  maybeQueueResolutionAnimation(session)
  centurionRenderer.resize(panelBoardSize(centurionBoardPanel))
  if (!renderCenturionAnimationFrame(session)) {
    centurionRenderer.render(
      matchRenderModel(
        match,
        viewer,
        session.selectedSquare,
        session.resolving,
      ),
    )
  }
}

function confirmReturnToLobby(model: CenturionModel): boolean {
  if (model.tag === 'lobby') {
    return true
  }
  const message =
    model.tag === 'playing'
      ? 'Leave this match and return to the lobby?'
      : 'Cancel and return to the lobby?'
  return window.confirm(message)
}

function renderCenturionChrome(model: CenturionModel): void {
  const inLobby = model.tag === 'lobby'
  centurionBackButton.style.display = inLobby ? 'none' : ''
  centurionLabsFoot.style.display = inLobby ? 'block' : 'none'
}

function renderCenturion(model: CenturionModel): void {
  const inSession = model.tag === 'playing'
  centurionLobby.style.display = inSession ? 'none' : 'flex'
  centurionSession.style.display = inSession ? 'grid' : 'none'
  renderCenturionChrome(model)

  if (model.tag === 'playing') {
    renderCenturionSession(model.session)
    return
  }

  resetCenturionAnimation()

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
      const base = `New match created. Share code ${model.code} to invite your opponent. Keep this page open until they join.`
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
    navigate('game')
    tryRestorePersistedSession()
  })
  button('labs-menu-back-btn').addEventListener('click', () => {
    navigate('game')
    tryRestorePersistedSession()
  })

  button('superposition-back-btn').addEventListener('click', () => {
    navigate('labs')
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
    navigate('labs')
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

  centurionBackButton.addEventListener('click', () => {
    if (state.tag !== 'centurion-match') {
      return
    }
    if (!confirmReturnToLobby(state.model)) {
      return
    }
    dispatchCenturion({ tag: 'leave-session-requested' })
  })
  button('centurion-open-labs-btn').addEventListener('click', () => {
    navigate('labs')
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
  centurionGameSelect.addEventListener('change', () => {
    dispatchCenturion({
      tag: 'game-replay-game-selected',
      gameId: Number(centurionGameSelect.value),
    })
  })
  centurionReplayStartButton.addEventListener('click', () => {
    dispatchCenturion({ tag: 'game-replay-step', step: 'start' })
  })
  centurionReplayPrevButton.addEventListener('click', () => {
    dispatchCenturion({ tag: 'game-replay-step', step: 'prev' })
  })
  centurionReplayNextButton.addEventListener('click', () => {
    dispatchCenturion({ tag: 'game-replay-step', step: 'next' })
  })
  centurionReplayEndButton.addEventListener('click', () => {
    dispatchCenturion({ tag: 'game-replay-step', step: 'end' })
  })
  centurionConnectionLogClear.addEventListener('click', () => {
    clearConnectionLog()
    renderConnectionLog(centurionConnectionLogList)
  })
  centurionCanvas.addEventListener('click', (event) => {
    const square = centurionSquareFromClick(event as MouseEvent)
    if (square === null) {
      return
    }
    dispatchCenturion({ tag: 'board-square-clicked', square })
  })

  for (const entry of displayModeButtons) {
    entry.button.addEventListener('click', () => {
      applyPieceDisplayMode(entry.mode)
      render()
    })
  }

  window.addEventListener('popstate', () => {
    navigate(pathnameToAppRoute(window.location.pathname), false)
  })

  window.addEventListener('resize', () => {
    render()
  })
}

function tryRestorePersistedSession(): void {
  if (pathnameToAppRoute(window.location.pathname) === 'labs') {
    return
  }
  // A broken saved session must never take down the app: if anything
  // throws while resuming, drop the saved state and show a fresh lobby.
  try {
    const persisted = loadCenturionPersistence()
    if (persisted === null) {
      return
    }
    if (persisted.tag === 'waiting') {
      hostPendingSeed = persisted.pendingSeed
    }
    const [model, commands] = updateCenturion(initCenturionModel(), {
      tag: 'restore-session-requested',
      persisted,
    })
    state = { tag: 'centurion-match', model }
    persistCenturionState()
    render()
    for (const command of commands) {
      runCommand({ tag: 'centurion', cmd: command })
    }
  } catch (error) {
    clearCenturionPersistence()
    hostPendingSeed = null
    state = initAppState()
    logConnection(
      `Failed to restore saved match (${
        error instanceof Error ? error.message : String(error)
      }); cleared saved state.`,
    )
    render()
  }
}

function autoJoinFromUrl(): void {
  if (state.tag === 'centurion-match' && state.model.tag !== 'lobby') {
    return
  }
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
  logConnection(`Invite link detected: auto-joining with code ${code}.`)
  const url = new URL(window.location.href)
  url.search = ''
  window.history.replaceState({}, '', `${url.pathname}${url.hash}`)
  dispatchCenturion({ tag: 'join-code-updated', value: code })
  dispatchCenturion({ tag: 'join-match-requested' })
}

bindEvents()
applyPieceDisplayMode('pieces')
logConnection(`Loaded at ${window.location.href}`)
logConnection(
  `Multiplayer signaling uses Trystero/Nostr (app id ${CENTURION_TRANSPORT_APP_ID}).`,
)
navigate(pathnameToAppRoute(window.location.pathname), false)
tryRestorePersistedSession()
autoJoinFromUrl()
