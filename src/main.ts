import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.brown.css'
import 'chessground/assets/chessground.cburnett.css'
import './styles.css'

import {
  FirebaseMatchRoomAdapter,
  generateRoomCode,
} from './adapters/firebase-match-room'
import {
  HttpCommandCompilerAdapter,
  defaultCommandCompilerEndpoint,
} from './adapters/http-command-compiler'
import {
  clearCenturionPersistence,
  loadCenturionPersistence,
  saveCenturionPersistence,
} from './adapters/local-storage-centurion-persistence'
import { StockfishEngineAdapter } from './adapters/stockfish-engine'
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
  connectionLogText,
  renderConnectionLog,
} from './connection-log'
import { describeCommandPredicate } from './core/command/describe'
import {
  type ResolutionAnimationPlan,
  planResolutionAnimation,
  resolutionAnimationFrame,
} from './core/match/animate'
import {
  aggregateMicroPawnStats,
  formatMicroPawns,
  microPawnHistogram,
  microPawnHistogramLabel,
} from './core/match/eval'
import { interactiveBoardSnapshot } from './core/match/interactive-position'
import {
  type IssuedCommand,
  type MatchState,
  type PlayerId,
  type RecordedMove,
  activeGameCount,
  activePlacer,
  canIssueCommands,
  startedGameCount,
} from './core/match/model'
import {
  commandForPly,
  describeGameReplayLabel,
  gameMoveSourceCounts,
  gamesForReplaySelection,
  matchGameToPgn,
  replaySnapshot,
} from './core/match/pgn'
import { aggregatePositionStats } from './core/match/position-stats'
import { matchRenderModel } from './core/match/render'
import { ENGINE_DEPTH } from './core/match/resolve'
import type { ParseResult } from './core/parsing/types'
import { assertNever } from './core/update'
import { CommandBoard } from './features/centurion-match/command-board'
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
  updateCenturion,
} from './features/centurion-match/update'
import {
  type CommandLabModel,
  commandLabMatches,
} from './features/command-lab/model'
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
const screenCommandLab = element('screen-command-lab')
const screenCenturion = element('screen-centurion-match')

const commandInput = textarea('command-input')
const commandEndpointInput = input('command-endpoint-input')
const commandFenInput = textarea('command-fen-input')
const commandCompileButton = button('command-compile-btn')
const commandDiagnostics = element('command-diagnostics')
const commandFenDiagnostics = element('command-fen-diagnostics')
const commandDescription = element('command-description')
const commandPredicate = element('command-predicate')
const commandMatches = element('command-matches')

const superpositionFenInput = textarea('superposition-fen-input')
const superpositionArrowInput = textarea('superposition-arrow-input')
const superpositionFenDiagnostics = element('superposition-fen-diagnostics')
const superpositionArrowDiagnostics = element('superposition-arrow-diagnostics')
const superpositionBoardPanel = element('superposition-board-panel')
const superpositionCanvas = canvas('superposition-canvas')
const superpositionRenderer = new SuperpositionRenderer(superpositionCanvas)

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
const centurionBarTop = element('centurion-bar-top')
const centurionBarBottom = element('centurion-bar-bottom')
const centurionScoreTop = element('centurion-score-top')
const centurionScoreBottom = element('centurion-score-bottom')
const centurionStatusTop = element('centurion-status-top')
const centurionStatusBottom = element('centurion-status-bottom')
const centurionMetaLine = element('centurion-meta-line')
const centurionSessionNotice = element('centurion-session-notice')
const centurionResultBanner = element('centurion-result-banner')
const centurionBoardHint = element('centurion-board-hint')
const centurionResolutionSummary = element('centurion-resolution-summary')
const centurionMicroPawnEval = element('centurion-micro-pawn-eval')
const centurionMicroPawnAvg = element('centurion-micro-pawn-avg')
const centurionMicroPawnHistogram = element('centurion-micro-pawn-histogram')
const centurionCommandInput = textarea('centurion-command-input')
const centurionIssueButton = button('centurion-issue-btn')
const centurionPassButton = button('centurion-pass-btn')
const centurionCommandStatus = element('centurion-command-status')
const centurionRecentCommands = element('centurion-recent-commands')
const centurionStatsPanel = element('centurion-stats-panel')
const centurionStatsContent = element('centurion-stats-content')
const centurionStatsTabOverview = button('centurion-stats-tab-overview')
const centurionStatsTabMaterial = button('centurion-stats-tab-material')
const centurionStatsTabThreats = button('centurion-stats-tab-threats')
const centurionCommandHistory = element('centurion-command-history')
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
let centurionActiveStatsTab: 'overview' | 'material' | 'threats' = 'overview'
const centurionBoardPanel = element('centurion-board-panel')
const centurionCanvas = canvas('centurion-canvas')
const centurionCommandBoardHost = element('centurion-command-board')
const centurionRenderer = new SuperpositionRenderer(centurionCanvas)
const centurionCommandBoard = new CommandBoard(
  centurionCommandBoardHost,
  (text) => {
    dispatchCenturion({ tag: 'command-input-updated', value: text })
    dispatchCenturion({ tag: 'command-issue-requested' })
  },
)
const centurionConnectionLogList = element(
  'centurion-connection-log-list',
) as HTMLOListElement
const centurionConnectionLogClear = button('centurion-connection-log-clear')
const centurionConnectionLogCopy = button('centurion-connection-log-copy')

// Pieces/Letters is a lab-only view preference; the game board always
// draws pieces.
const displayModeButtons: ReadonlyArray<{
  readonly button: HTMLButtonElement
  readonly mode: PieceDisplayMode
}> = [
  { button: button('superposition-mode-pieces'), mode: 'pieces' },
  { button: button('superposition-mode-letters'), mode: 'letters' },
]

function applyPieceDisplayMode(mode: PieceDisplayMode): void {
  superpositionRenderer.displayMode = mode
  for (const entry of displayModeButtons) {
    entry.button.classList.toggle('active', entry.mode === mode)
  }
}

const centurionRoom = new FirebaseMatchRoomAdapter()
const centurionEngine = new StockfishEngineAdapter()
const commandCompiler = new HttpCommandCompilerAdapter()

let state: AppState = initAppState()

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

/**
 * Copies text to the clipboard, falling back to a hidden textarea +
 * execCommand for browsers/contexts where the async Clipboard API is
 * unavailable (older mobile Safari, some in-app webviews). Resolves to
 * whether the copy succeeded.
 */
async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to the legacy path below.
    }
  }
  if (typeof document === 'undefined') {
    return false
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(textarea)
  return ok
}

let connectionLogCopyResetTimer: ReturnType<typeof setTimeout> | null = null

function copyConnectionLog(): void {
  const text = connectionLogText()
  if (text.length === 0) {
    flashConnectionLogCopyLabel('Log is empty')
    return
  }
  void copyTextToClipboard(text).then((ok) => {
    flashConnectionLogCopyLabel(ok ? 'Copied!' : 'Copy failed')
  })
}

function flashConnectionLogCopyLabel(label: string): void {
  centurionConnectionLogCopy.textContent = label
  if (connectionLogCopyResetTimer !== null) {
    clearTimeout(connectionLogCopyResetTimer)
  }
  connectionLogCopyResetTimer = setTimeout(() => {
    centurionConnectionLogCopy.textContent = 'Copy log'
    connectionLogCopyResetTimer = null
  }, 1_500)
}

centurionRoom.setCallbacks({
  onLog: (message) => {
    logConnection(message)
  },
  onOpened: () => {
    logConnection('Room open.')
    dispatchCenturion({ tag: 'room-opened' })
  },
  onError: (message) => {
    logConnection(`Room error: ${message}`)
    dispatchCenturion({ tag: 'room-error', message })
  },
  onPeerPresence: (present) => {
    logConnection(present ? 'Opponent is present.' : 'Opponent is away.')
    dispatchCenturion({ tag: 'room-peer-presence', present })
  },
  onState: (roomState) => {
    logConnection('Received match state from the room.')
    dispatchCenturion({ tag: 'room-state-received', state: roomState })
  },
})

function runCommand(command: AppCmd): void {
  if (command.tag === 'command-lab') {
    runCommandLabCommand(command.cmd)
    return
  }
  const cmd = command.cmd
  switch (cmd.tag) {
    case 'room-open':
      logConnection(`Opening room ${cmd.code} as ${cmd.role}.`)
      centurionRoom.open(cmd.code, cmd.role, cmd.seed)
      return
    case 'room-publish':
      logConnection(`Publishing match state (turn ${cmd.state.turn}).`)
      centurionRoom.publishState(cmd.state)
      return
    case 'room-leave':
      logConnection('Leaving the room.')
      centurionRoom.leave()
      return
    case 'share-invite':
      shareInvite(cmd.code)
      return
    case 'copy-invite':
      copyInvite(cmd.code)
      return
    case 'compute-ranked-moves':
      centurionEngine.rankedMoves(cmd.fens, ENGINE_DEPTH).then(
        (ranked) => {
          dispatchCenturion({ tag: 'ranked-moves-computed', ranked })
        },
        (error: unknown) => {
          dispatchCenturion({
            tag: 'ranked-moves-failed',
            message: error instanceof Error ? error.message : String(error),
          })
        },
      )
      return
    case 'compile-command':
      void commandCompiler
        .compile(defaultCommandCompilerEndpoint(), cmd.text)
        .then((result) => {
          dispatchCenturion({
            tag: 'command-compile-finished',
            text: cmd.text,
            result,
          })
        })
      return
    default:
      assertNever(cmd)
      return
  }
}

function runCommandLabCommand(
  cmd: Extract<AppCmd, { tag: 'command-lab' }>['cmd'],
): void {
  void commandCompiler.compile(cmd.endpoint, cmd.command).then((result) => {
    dispatch({
      tag: 'command-lab-msg',
      msg: { tag: 'compile-finished', command: cmd.command, result },
    })
  })
}

function setScreenVisibility(screen: AppState['tag']): void {
  screenLabsMenu.style.display = screen === 'labs-menu' ? 'flex' : 'none'
  screenSuperposition.style.display =
    screen === 'superposition-lab' ? 'flex' : 'none'
  screenCommandLab.style.display = screen === 'command-lab' ? 'flex' : 'none'
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

function renderCommandLab(model: CommandLabModel): void {
  if (commandInput.value !== model.commandInput) {
    commandInput.value = model.commandInput
  }
  if (commandEndpointInput.value !== model.endpointInput) {
    commandEndpointInput.value = model.endpointInput
  }
  if (commandFenInput.value !== model.fenInput) {
    commandFenInput.value = model.fenInput
  }

  commandCompileButton.disabled = model.compile.tag === 'compiling'
  commandDiagnostics.innerHTML = ''
  const statusLine = document.createElement('li')
  switch (model.compile.tag) {
    case 'idle':
      statusLine.className = 'diagnostic-ok'
      statusLine.textContent = 'Type a command and compile it.'
      break
    case 'compiling':
      statusLine.className = 'diagnostic-ok'
      statusLine.textContent = `Compiling "${model.compile.command}"...`
      break
    case 'compiled':
      statusLine.className = 'diagnostic-ok'
      statusLine.textContent = `Compiled "${model.compile.command}".`
      break
    case 'failed':
      statusLine.className = 'diagnostic-error'
      statusLine.textContent = model.compile.message
      break
    default:
      assertNever(model.compile)
  }
  commandDiagnostics.appendChild(statusLine)

  renderDiagnostics(
    commandFenDiagnostics,
    model.fenParse,
    model.fenParse.tag === 'valid'
      ? `Parsed ${model.fenParse.value.length} position(s).`
      : 'FEN parsing failed.',
  )

  if (model.compile.tag === 'compiled') {
    commandDescription.textContent = describeCommandPredicate(
      model.compile.predicate,
    )
    commandPredicate.textContent = JSON.stringify(
      model.compile.predicate,
      null,
      2,
    )
  } else {
    commandDescription.textContent = ''
    commandPredicate.textContent = ''
  }

  commandMatches.innerHTML = ''
  for (const [index, entry] of commandLabMatches(model).entries()) {
    const item = document.createElement('li')
    item.title = entry.fen
    item.textContent =
      entry.sans.length === 0
        ? `Position ${index + 1}: no matching moves`
        : `Position ${index + 1}: ${entry.sans.length} matching - ${entry.sans.join(' ')}`
    commandMatches.appendChild(item)
  }
}

function playerLabel(session: MatchSession, player: PlayerId): string {
  if (session.mode.tag === 'solo') {
    return player === 1 ? 'You' : 'Computer'
  }
  if (session.mode.tag === 'remote') {
    return session.mode.you === player ? 'You' : 'Opponent'
  }
  return `Player ${player}`
}

/** Compact per-player label for score chips and one-line summaries. */
function scoreLabel(session: MatchSession, player: PlayerId): string {
  if (session.mode.tag === 'local') {
    return `P${player}`
  }
  return playerLabel(session, player)
}

function matchMetaText(session: MatchSession): string {
  const match = session.match
  if (match.phase.tag === 'finished') {
    return 'Match over'
  }
  const games = `${activeGameCount(match)} active · ${startedGameCount(match)}/${match.gameCount} in match`
  if (session.resolving !== null) {
    return `Turn ${match.turn} · ${games} · Resolving...`
  }
  if (!canIssueCommands(match)) {
    return `Turn ${match.turn} · ${games} · Soldier playout`
  }
  return `Turn ${match.turn} · ${games}`
}

function describeResult(session: MatchSession, match: MatchState): string {
  if (match.phase.tag !== 'finished') {
    return ''
  }
  const winner = match.phase.winner
  const score = `${match.scores.p1} : ${match.scores.p2}`
  if (winner === 'draw') {
    return `Match drawn ${score}.`
  }
  const label = playerLabel(session, winner)
  return label === 'You'
    ? `You win the match ${score}!`
    : `${label} wins the match ${score}.`
}

function renderMicroPawnEval(session: MatchSession): void {
  const match = session.match
  const viewer = sessionViewer(session)
  const stats = aggregateMicroPawnStats(match, viewer)
  const showPanel = stats.activeGames > 0
  centurionMicroPawnEval.hidden = !showPanel
  if (!showPanel) {
    centurionMicroPawnAvg.textContent = ''
    centurionMicroPawnAvg.className = 'centurion-micro-pawn-avg'
    centurionMicroPawnHistogram.innerHTML = ''
    centurionMicroPawnHistogram.removeAttribute('aria-label')
    return
  }

  const avgText = formatMicroPawns(stats.medianCp)
  centurionMicroPawnAvg.textContent = avgText
  centurionMicroPawnAvg.title = 'Median position across active games'
  if (stats.medianCp > 10) {
    centurionMicroPawnAvg.className =
      'centurion-micro-pawn-avg centurion-micro-pawn-avg--ahead'
  } else if (stats.medianCp < -10) {
    centurionMicroPawnAvg.className =
      'centurion-micro-pawn-avg centurion-micro-pawn-avg--behind'
  } else {
    centurionMicroPawnAvg.className = 'centurion-micro-pawn-avg'
  }
  centurionMicroPawnHistogram.setAttribute(
    'aria-label',
    microPawnHistogramLabel(match, viewer),
  )

  const bins = microPawnHistogram(match, viewer)
  const center = Math.floor(bins.length / 2)
  const peak = Math.max(...bins, 1)
  centurionMicroPawnHistogram.innerHTML = ''
  for (let index = 0; index < bins.length; index++) {
    const count = bins[index] ?? 0
    const bar = document.createElement('span')
    const tone =
      index < center
        ? 'centurion-micro-pawn-histogram-bar--behind'
        : index > center
          ? 'centurion-micro-pawn-histogram-bar--ahead'
          : 'centurion-micro-pawn-histogram-bar--even'
    bar.className = `centurion-micro-pawn-histogram-bar ${tone}`
    bar.style.height = `${Math.max(8, Math.round((count / peak) * 100))}%`
    centurionMicroPawnHistogram.appendChild(bar)
  }
}

function resolutionSummaryText(session: MatchSession): string {
  const summary = session.match.lastResolution
  if (summary === null) {
    return 'No turns resolved yet.'
  }
  const base = `Turn ${summary.turn}: ${summary.commandMoves} game(s) followed the order, ${summary.freeMoves} moved freely.`
  const command = session.match.commands.find(
    (entry) => entry.turn === summary.turn,
  )
  const interpretation =
    command === undefined
      ? ''
      : ` Interpreted as: ${describeCommandPredicate(command.predicate)}.`
  const decided = summary.p1Wins + summary.p2Wins + summary.draws
  if (decided === 0) {
    return `${base}${interpretation}`
  }
  return `${base}${interpretation} Decided: ${scoreLabel(session, 1)} +${summary.p1Wins}, ${scoreLabel(session, 2)} +${summary.p2Wins}, draws +${summary.draws}.`
}

function renderPositionStats(session: MatchSession): void {
  const stats = aggregatePositionStats(session.match, sessionViewer(session))
  const showPanel = stats.activeGames > 0
  centurionStatsPanel.hidden = !showPanel
  if (!showPanel) {
    centurionStatsContent.innerHTML = ''
    return
  }

  for (const tab of [
    centurionStatsTabOverview,
    centurionStatsTabMaterial,
    centurionStatsTabThreats,
  ]) {
    const active =
      tab.getAttribute('data-stats-tab') === centurionActiveStatsTab
    tab.classList.toggle('centurion-stats-tab--active', active)
    tab.setAttribute('aria-selected', active ? 'true' : 'false')
  }

  const rows: ReadonlyArray<readonly [string, string]> =
    centurionActiveStatsTab === 'material'
      ? [
          ['Your queens', String(stats.queens)],
          ['Avg pawn rank', stats.averagePawnRank.toFixed(1)],
        ]
      : centurionActiveStatsTab === 'threats'
        ? [
            ['Games in check', String(stats.gamesInCheck)],
            ['Castles available', String(stats.castlesAvailable)],
            ['Promotions available', String(stats.promotionsAvailable)],
          ]
        : [
            ['Active games', String(stats.activeGames)],
            [
              'Median eval',
              formatMicroPawns(
                aggregateMicroPawnStats(session.match, sessionViewer(session))
                  .medianCp,
              ),
            ],
            [
              'Started games',
              `${startedGameCount(session.match)}/${session.match.gameCount}`,
            ],
          ]

  centurionStatsContent.innerHTML = ''
  for (const [label, value] of rows) {
    const dt = document.createElement('dt')
    dt.textContent = label
    const dd = document.createElement('dd')
    dd.textContent = value
    centurionStatsContent.append(dt, dd)
  }
}

function renderRecentCommands(session: MatchSession): void {
  const recent = session.match.commands.slice(-4).reverse()
  const yours = turnIsYours(session)
  centurionRecentCommands.hidden = recent.length === 0 || !yours
  centurionRecentCommands.innerHTML = ''
  for (const command of recent) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn btn-outline centurion-reissue-btn'
    btn.title = describeCommandPredicate(command.predicate)
    btn.textContent = command.text
    btn.addEventListener('click', () => {
      dispatchCenturion({
        tag: 'command-input-updated',
        value: command.text,
      })
    })
    centurionRecentCommands.appendChild(btn)
  }
}

function boardHintText(session: MatchSession): string {
  if (session.inputError !== null) {
    return session.inputError
  }
  return ''
}

/** Whether this client may submit/pass right now. */
function turnIsYours(session: MatchSession): boolean {
  const match = session.match
  if (
    match.phase.tag === 'finished' ||
    session.resolving !== null ||
    !canIssueCommands(match)
  ) {
    return false
  }
  if (session.mode.tag === 'remote') {
    return activePlacer(match) === session.mode.you
  }
  return true
}

function commandStatusText(session: MatchSession): string {
  const draft = session.draft
  switch (draft.tag) {
    case 'idle':
      return turnIsYours(session) ? 'Type an order and submit it.' : ''
    case 'compiling':
      return `Submitting "${draft.text}"...`
    case 'failed':
      return `Could not interpret order: ${draft.message}`
    default:
      return assertNever(draft)
  }
}

/** Describes how the currently shown replay move was decided. */
function replayMoveSourceText(
  session: MatchSession,
  record: RecordedMove,
): string {
  if (record.source === 'free') {
    return "Soldier's own move"
  }
  const owner = record.commandOwner
  if (owner === undefined) {
    return 'Ordered by command'
  }
  const label = playerLabel(session, owner)
  return label === 'You' ? 'Ordered by you' : `Ordered by ${label}`
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
      return `${game.id}:${counts.command}:${counts.free}:${game.moves.length}`
    })
    .join('|')
  if (centurionGameReplayOptionsKey !== optionsKey) {
    centurionGameReplayOptionsKey = optionsKey
    centurionGameSelect.innerHTML = ''
    for (const game of sortedGames) {
      const option = document.createElement('option')
      option.value = String(game.id)
      option.textContent = describeGameReplayLabel(game, {
        p1: scoreLabel(session, 1),
        p2: scoreLabel(session, 2),
      })
      centurionGameSelect.appendChild(option)
    }
  }
  centurionGameSelect.value = String(replay.gameId)

  const snapshot = replaySnapshot(selectedGame, replay.ply)
  const record = snapshot.lastMoveRecord
  centurionReplayBoard.setPosition(
    snapshot.fen,
    snapshot.lastMove,
    record?.source === 'command' ? { owner: record.commandOwner } : undefined,
  )
  centurionReplayBoard.redraw()

  const sourceCounts = gameMoveSourceCounts(selectedGame)
  const command = commandForPly(match, selectedGame, snapshot.ply)
  const commandNote =
    command === null
      ? ''
      : `\nOrder: "${command.text}" → ${describeCommandPredicate(command.predicate)}`
  const sourceNote =
    record === undefined ? '' : ` · ${replayMoveSourceText(session, record)}`
  centurionReplayMoveInfo.textContent =
    snapshot.moveCount === 0
      ? 'No moves recorded for this game.'
      : `Ply ${snapshot.ply} of ${snapshot.moveCount} (${sourceCounts.command} ordered, ${sourceCounts.free} free)${sourceNote}${commandNote}`

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
function renderCenturionAnimationFrame(): boolean {
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
    const frame = resolutionAnimationFrame(head, elapsed)
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
    if (!renderCenturionAnimationFrame()) {
      // Queue drained: settle the canvas on the live board.
      centurionRenderer.render(
        matchRenderModel(session.match, sessionViewer(session)),
      )
    }
  })
}

function renderCenturionSession(session: MatchSession): void {
  const match = session.match
  const viewer = sessionViewer(session)

  // No team names: the bar under the board is the viewer's side, the bar
  // above it is the opponent's, mirroring how the pieces are drawn.
  const topPlayer: PlayerId = viewer === 1 ? 2 : 1
  const scoreOf = (player: PlayerId): number =>
    player === 1 ? match.scores.p1 : match.scores.p2
  centurionScoreTop.textContent = String(scoreOf(topPlayer))
  centurionScoreBottom.textContent = String(scoreOf(viewer))
  centurionMetaLine.textContent = matchMetaText(session)

  const placing =
    match.phase.tag === 'active' &&
    session.resolving === null &&
    canIssueCommands(match)
      ? activePlacer(match)
      : null
  const sides: ReadonlyArray<{
    readonly bar: HTMLElement
    readonly score: HTMLElement
    readonly status: HTMLElement
    readonly player: PlayerId
  }> = [
    {
      bar: centurionBarTop,
      score: centurionScoreTop,
      status: centurionStatusTop,
      player: topPlayer,
    },
    {
      bar: centurionBarBottom,
      score: centurionScoreBottom,
      status: centurionStatusBottom,
      player: viewer,
    },
  ]
  for (const side of sides) {
    const active = placing === side.player
    // Scores wear the same tint as that player's arrows and counts.
    side.score.classList.toggle('centurion-player-score--p1', side.player === 1)
    side.score.classList.toggle('centurion-player-score--p2', side.player === 2)
    side.bar.classList.toggle(
      'centurion-player-bar--active-p1',
      active && side.player === 1,
    )
    side.bar.classList.toggle(
      'centurion-player-bar--active-p2',
      active && side.player === 2,
    )
    side.status.textContent = active
      ? session.mode.tag === 'remote' && side.player !== session.mode.you
        ? 'Their turn...'
        : 'Submit an order'
      : ''
  }

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

  centurionResolutionSummary.textContent = resolutionSummaryText(session)
  renderMicroPawnEval(session)
  renderPositionStats(session)
  renderRecentCommands(session)

  const yours = turnIsYours(session)
  if (centurionCommandInput.value !== session.commandInput) {
    centurionCommandInput.value = session.commandInput
  }
  centurionCommandInput.disabled = !yours
  centurionIssueButton.disabled =
    !yours ||
    session.draft.tag === 'compiling' ||
    session.commandInput.trim() === ''
  centurionPassButton.disabled = !yours
  centurionCommandStatus.textContent = commandStatusText(session)

  centurionCommandHistory.innerHTML = ''
  const orders: readonly IssuedCommand[] = match.commands
  for (const command of [...orders].reverse()) {
    const item = document.createElement('li')
    const clickable = turnIsYours(session)
    item.className = `centurion-arrow-entry centurion-arrow-entry--player-${command.owner}${clickable ? ' centurion-arrow-entry--clickable' : ''}`
    const gamesNote =
      command.commandMoves === 1 ? '1 game' : `${command.commandMoves} games`
    const dsl = describeCommandPredicate(command.predicate)
    item.textContent = `T${command.turn} ${scoreLabel(session, command.owner)}: "${command.text}" — ${gamesNote} · ${dsl}`
    item.title = clickable ? `Click to reissue: ${command.text}` : dsl
    if (clickable) {
      item.addEventListener('click', () => {
        dispatchCenturion({
          tag: 'command-input-updated',
          value: command.text,
        })
      })
    }
    centurionCommandHistory.appendChild(item)
  }

  renderGameReplay(session)

  maybeQueueResolutionAnimation(session)
  centurionRenderer.resize(panelBoardSize(centurionBoardPanel))
  const commandBoardEnabled =
    turnIsYours(session) &&
    centurionAnimationQueue.length === 0 &&
    session.draft.tag !== 'compiling'
  const commandSnapshot = commandBoardEnabled
    ? interactiveBoardSnapshot(match, viewer)
    : null
  centurionCommandBoardHost.hidden =
    !commandBoardEnabled || commandSnapshot === null
  centurionCommandBoard.sync(commandSnapshot, commandBoardEnabled)
  if (!renderCenturionAnimationFrame()) {
    centurionRenderer.render(matchRenderModel(match, viewer))
  }
  centurionCommandBoard.redraw()
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
      centurionStatusCopy.textContent = model.notice ?? ''
      if (centurionJoinCodeInput.value !== model.joinCodeInput) {
        centurionJoinCodeInput.value = model.joinCodeInput
      }
      return
    case 'connecting-host':
      centurionStatusCopy.textContent = 'Creating match...'
      return
    case 'connecting-guest':
      centurionStatusCopy.textContent = `Joining match ${model.code}...`
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

  if (state.tag === 'command-lab') {
    renderCommandLab(state.model)
    return
  }

  if (state.tag === 'centurion-match') {
    renderCenturion(state.model)
    return
  }
}

function bindEvents(): void {
  button('labs-menu-open-superposition').addEventListener('click', () => {
    dispatch({ tag: 'open-superposition-lab' })
  })
  button('labs-menu-open-command').addEventListener('click', () => {
    dispatch({ tag: 'open-command-lab' })
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

  button('command-back-btn').addEventListener('click', () => {
    navigate('labs')
  })
  button('command-reset-btn').addEventListener('click', () => {
    dispatch({
      tag: 'command-lab-msg',
      msg: { tag: 'reset-fixtures-requested' },
    })
  })
  commandCompileButton.addEventListener('click', () => {
    dispatch({ tag: 'command-lab-msg', msg: { tag: 'compile-requested' } })
  })
  commandInput.addEventListener('input', (event) => {
    dispatch({
      tag: 'command-lab-msg',
      msg: {
        tag: 'command-input-updated',
        value: (event.target as HTMLTextAreaElement).value,
      },
    })
  })
  commandEndpointInput.addEventListener('input', (event) => {
    dispatch({
      tag: 'command-lab-msg',
      msg: {
        tag: 'endpoint-input-updated',
        value: (event.target as HTMLInputElement).value,
      },
    })
  })
  commandFenInput.addEventListener('input', (event) => {
    dispatch({
      tag: 'command-lab-msg',
      msg: {
        tag: 'fen-input-updated',
        value: (event.target as HTMLTextAreaElement).value,
      },
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
    dispatchCenturion({
      tag: 'new-match-requested',
      seed: newSeed(),
      code: generateRoomCode(),
    })
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
  centurionLeaveButton.addEventListener('click', () => {
    dispatchCenturion({ tag: 'leave-session-requested' })
  })
  centurionCommandInput.addEventListener('input', (event) => {
    dispatchCenturion({
      tag: 'command-input-updated',
      value: (event.target as HTMLTextAreaElement).value,
    })
  })
  centurionIssueButton.addEventListener('click', () => {
    dispatchCenturion({ tag: 'command-issue-requested' })
  })
  centurionPassButton.addEventListener('click', () => {
    dispatchCenturion({ tag: 'pass-requested' })
  })
  for (const tab of [
    centurionStatsTabOverview,
    centurionStatsTabMaterial,
    centurionStatsTabThreats,
  ]) {
    tab.addEventListener('click', () => {
      const next = tab.getAttribute('data-stats-tab')
      if (next === 'overview' || next === 'material' || next === 'threats') {
        centurionActiveStatsTab = next
        render()
      }
    })
  }
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
  centurionConnectionLogCopy.addEventListener('click', () => {
    copyConnectionLog()
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
  `Multiplayer build ${__MULTIPLAYER_BUILD_ID__}: match state syncs through Firebase Realtime Database. Hard-refresh both devices if this build id looks stale.`,
)
navigate(pathnameToAppRoute(window.location.pathname), false)
tryRestorePersistedSession()
autoJoinFromUrl()
