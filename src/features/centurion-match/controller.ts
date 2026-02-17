const LOBBY_COPY = 'Start a new match or join one with a code.'
const INVALID_JOIN_CODE_COPY = 'Enter a valid 6-digit match code.'

interface CenturionControllerOptions {
  readonly root: HTMLElement
  readonly onRequestExit: () => void
}

function normaliseCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6)
}

function generateCode(): string {
  return Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0')
}

export class CenturionMatchController {
  private readonly root: HTMLElement
  private readonly onRequestExit: () => void
  private bound = false
  private mounted = false
  private statusCopy = LOBBY_COPY
  private joinCode = ''

  constructor(options: CenturionControllerOptions) {
    this.root = options.root
    this.onRequestExit = options.onRequestExit
  }

  mount(): void {
    this.mounted = true
    this.bindEventsOnce()
    this.statusCopy = LOBBY_COPY
    this.joinCode = ''
    this.render()
  }

  unmount(): void {
    this.mounted = false
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
      const code = generateCode()
      this.joinCode = code
      this.statusCopy = `New match created. Share code ${code} to invite your opponent.`
      this.render()
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
      this.statusCopy = `Joining match ${code}...`
      this.render()
    })
  }

  private render(): void {
    const body = this.element('centurion-status-copy')
    const controls = this.element('centurion-controls')

    if (!this.mounted) {
      body.textContent = ''
      controls.setAttribute('data-state', 'hidden')
      return
    }

    const joinCodeInput = this.input('centurion-join-code-input')
    body.textContent = this.statusCopy
    controls.setAttribute('data-state', 'ready')
    if (joinCodeInput.value !== this.joinCode) {
      joinCodeInput.value = this.joinCode
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
