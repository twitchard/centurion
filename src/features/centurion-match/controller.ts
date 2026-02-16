type CenturionPhase = 'idle' | 'active' | 'resolving' | 'complete'

interface CenturionControllerOptions {
  readonly root: HTMLElement
  readonly onRequestExit: () => void
}

function phaseCopy(phase: CenturionPhase): string {
  switch (phase) {
    case 'idle':
      return 'Centurion Match is in preview while full gameplay is being rebuilt.'
    case 'active':
      return 'Match in progress.'
    case 'resolving':
      return 'Resolving this turn...'
    case 'complete':
      return 'Match complete.'
    default: {
      const exhaustive: never = phase
      throw new Error(`Unknown centurion phase: ${String(exhaustive)}`)
    }
  }
}

export class CenturionMatchController {
  private readonly root: HTMLElement
  private readonly onRequestExit: () => void
  private bound = false
  private mounted = false
  private phase: CenturionPhase = 'idle'

  constructor(options: CenturionControllerOptions) {
    this.root = options.root
    this.onRequestExit = options.onRequestExit
  }

  mount(): void {
    this.mounted = true
    this.bindEventsOnce()
    this.phase = 'idle'
    this.render()
  }

  unmount(): void {
    this.mounted = false
    this.phase = 'idle'
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
    this.button('centurion-to-active-btn').addEventListener('click', () => {
      this.setPhase('active')
    })
    this.button('centurion-to-resolving-btn').addEventListener('click', () => {
      this.setPhase('resolving')
    })
    this.button('centurion-to-complete-btn').addEventListener('click', () => {
      this.setPhase('complete')
    })
    this.button('centurion-reset-btn').addEventListener('click', () => {
      this.setPhase('idle')
    })
  }

  private setPhase(phase: CenturionPhase): void {
    this.phase = phase
    this.render()
  }

  private render(): void {
    const badge = this.element('centurion-phase-badge')
    const body = this.element('centurion-status-copy')
    const controls = this.element('centurion-controls')

    if (!this.mounted) {
      badge.textContent = ''
      body.textContent = ''
      controls.setAttribute('data-phase', 'hidden')
      return
    }

    badge.textContent = this.phase.toUpperCase()
    body.textContent = phaseCopy(this.phase)
    controls.setAttribute('data-phase', this.phase)
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
}
