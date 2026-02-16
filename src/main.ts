import './styles.css'

import type { ParseResult } from './core/parsing/types'
import { TrysteroTransportAdapter } from './adapters/trystero-transport'
import { initAppState, type AppCmd, type AppMsg, type AppState } from './app/model'
import { updateApp } from './app/update'
import { CenturionMatchController } from './features/centurion-match/controller'
import type { ChatConnectionState, ChatLabModel, ChatLine } from './features/chat-lab/model'
import { SuperpositionRenderer } from './features/superposition-lab/render-superposition'
import type { SuperpositionLabModel } from './features/superposition-lab/model'

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

const screenMenu = element('screen-menu')
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

const chatTransport = new TrysteroTransportAdapter()

let state: AppState = initAppState()

function dispatch(msg: AppMsg): void {
  const [nextState, commands] = updateApp(state, msg)
  state = nextState
  render()
  for (const command of commands) {
    runCommand(command)
  }
}

const centurionController = new CenturionMatchController({
  root: screenCenturion,
  onRequestExit: () => {
    dispatch({ tag: 'back-to-menu' })
  },
})

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
        default: {
          const exhaustive: never = command.cmd
          return
        }
      }
    case 'centurion-match':
      if (command.cmd.tag === 'mount') {
        centurionController.mount()
        return
      }
      centurionController.unmount()
      return
    case 'superposition-lab':
      return
    default: {
      const exhaustive: never = command
      return
    }
  }
}

function setScreenVisibility(screen: AppState['tag']): void {
  screenMenu.style.display = screen === 'menu' ? 'flex' : 'none'
  screenSuperposition.style.display = screen === 'superposition-lab' ? 'flex' : 'none'
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

function resizeSuperpositionRenderer(): void {
  const maxSquare = Math.min(
    superpositionBoardPanel.clientWidth,
    superpositionBoardPanel.clientHeight > 0
      ? superpositionBoardPanel.clientHeight
      : superpositionBoardPanel.clientWidth,
    720,
  )
  superpositionRenderer.resize(maxSquare)
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

  resizeSuperpositionRenderer()
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
    default: {
      const exhaustive: never = connection
      return 'Unknown'
    }
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
    return
  }
}

function bindEvents(): void {
  button('menu-open-superposition').addEventListener('click', () => {
    dispatch({ tag: 'open-superposition-lab' })
  })
  button('menu-open-chat').addEventListener('click', () => {
    dispatch({ tag: 'open-chat-lab' })
  })
  button('menu-open-centurion').addEventListener('click', () => {
    dispatch({ tag: 'open-centurion-match' })
  })

  button('superposition-back-btn').addEventListener('click', () => {
    dispatch({ tag: 'back-to-menu' })
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
    dispatch({ tag: 'back-to-menu' })
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

  window.addEventListener('resize', () => {
    if (state.tag !== 'superposition-lab') {
      return
    }
    resizeSuperpositionRenderer()
    superpositionRenderer.render(state.model.renderModel)
  })
}

bindEvents()
render()
