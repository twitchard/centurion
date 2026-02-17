import type {
  TransportCallbacks,
  TransportPort,
  TransportStatus,
} from '../../ports/transport'

const LOBBY_COPY = 'Start a new match or join one with a code.'
const INVALID_JOIN_CODE_COPY = 'Enter a valid 6-digit match code.'
const SELF_JOIN_CODE_COPY =
  'You already created this match code on this device. Share it with your opponent instead.'
const TRANSPORT_ERROR_COPY =
  'Unable to connect to a match. Check your connection and try again.'

interface CenturionControllerOptions {
  readonly root: HTMLElement
  readonly onRequestExit: () => void
  readonly transport: TransportPort
}

function normaliseCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6)
}

export class CenturionMatchController {
  private readonly root: HTMLElement
  private readonly onRequestExit: () => void
  private readonly transport: TransportPort
  private bound = false
  private mounted = false
  private connectionStatus: TransportStatus = 'disconnected'
  private statusCopy = LOBBY_COPY
  private joinCode = ''

  constructor(options: CenturionControllerOptions) {
    this.root = options.root
    this.onRequestExit = options.onRequestExit
    this.transport = options.transport
    this.transport.setCallbacks(this.transportCallbacks())
  }

  mount(): void {
    this.mounted = true
    this.bindEventsOnce()
    this.transport.disconnect()
    this.connectionStatus = 'disconnected'
    this.statusCopy = LOBBY_COPY
    this.joinCode = ''
    this.render()
  }

  unmount(): void {
    this.mounted = false
    this.transport.disconnect()
    this.connectionStatus = 'disconnected'
    this.statusCopy = LOBBY_COPY
    this.joinCode = ''
    this.render()
  }

  private bindEventsOnce(): void {
    if (this.bound) {
      return
    }
    this.bound = true

    this.button('centurion-back-btn').addEventListener('click', () => {
      this.onRequestExit()
    })
    this.button('centurion-new-match-btn').addEventListener('click', () => {
      this.joinCode = ''
      this.transport.createRoom()
    })

    const joinCodeInput = this.input('centurion-join-code-input')
    joinCodeInput.addEventListener('input', (event) => {
      const value = normaliseCode((event.target as HTMLInputElement).value)
      this.joinCode = value
      if (joinCodeInput.value !== value) {
        joinCodeInput.value = value
      }
    })

    this.button('centurion-join-match-btn').addEventListener('click', () => {
      const code = normaliseCode(this.joinCode)
      this.joinCode = code
      if (code.length !== 6) {
        this.statusCopy = INVALID_JOIN_CODE_COPY
        this.render()
        return
      }
      if (
        this.transport.isHost &&
        this.connectionStatus !== 'disconnected' &&
        this.transport.code === code
      ) {
        this.statusCopy = SELF_JOIN_CODE_COPY
        this.render()
        return
      }
      this.transport.joinRoom(code)
    })
  }

  private render(): void {
    const body = this.element('centurion-status-copy')

    if (!this.mounted) {
      body.textContent = ''
      return
    }

    const joinCodeInput = this.input('centurion-join-code-input')
    const joinMatchButton = this.button('centurion-join-match-btn')
    body.textContent = this.statusCopy
    joinMatchButton.disabled =
      this.joinCode.length !== 6 ||
      (!this.transport.isHost && this.connectionStatus === 'connecting')
    if (joinCodeInput.value !== this.joinCode) {
      joinCodeInput.value = this.joinCode
    }
  }

  private transportCallbacks(): TransportCallbacks {
    return {
      onStatusChange: (status) => {
        this.connectionStatus = status
        this.syncStatusCopyWithTransport(status)
        this.render()
      },
      onPeerJoin: () => {
        return
      },
      onPeerLeave: () => {
        return
      },
      onMessage: () => {
        return
      },
    }
  }

  private syncStatusCopyWithTransport(status: TransportStatus): void {
    const code = this.transport.code
    switch (status) {
      case 'disconnected':
        this.statusCopy = LOBBY_COPY
        return
      case 'connecting':
        this.statusCopy = this.transport.isHost
          ? `Creating match ${code}...`
          : `Joining match ${code}...`
        return
      case 'waiting':
        this.statusCopy = `New match created. Share code ${code} to invite your opponent.`
        return
      case 'connected':
        this.statusCopy = this.transport.isHost
          ? `Opponent joined match ${code}.`
          : `Joined match ${code}.`
        return
      case 'error':
        this.statusCopy = TRANSPORT_ERROR_COPY
        return
      default: {
        const exhaustive: never = status
        throw new Error(`Unknown transport status: ${String(exhaustive)}`)
      }
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
    const node = this.element(id)
    if (!(node instanceof HTMLButtonElement)) {
      throw new Error(`Expected centurion button for #${id}`)
    }
    return node
  }

  private input(id: string): HTMLInputElement {
    const node = this.element(id)
    if (!(node instanceof HTMLInputElement)) {
      throw new Error(`Expected centurion input for #${id}`)
    }
    return node
  }
}
