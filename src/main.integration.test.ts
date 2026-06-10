import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SUPERPOSITION_ARROW_INPUT,
  DEFAULT_SUPERPOSITION_FEN_INPUT,
} from './features/superposition-lab/model'

vi.mock('./adapters/trystero-transport', () => {
  type MockTransportStatus =
    | 'disconnected'
    | 'connecting'
    | 'waiting'
    | 'connected'
    | 'error'

  interface MockTransportCallbacks {
    readonly onStatusChange: (status: MockTransportStatus) => void
    readonly onPeerJoin: () => void
    readonly onPeerLeave: () => void
    readonly onMessage: (data: unknown) => void
  }

  const NOOP_CALLBACKS: MockTransportCallbacks = {
    onStatusChange: () => {
      return
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

  class MockTransportAdapter {
    code = ''
    isHost = false
    status: MockTransportStatus = 'disconnected'
    private callbacks: MockTransportCallbacks = NOOP_CALLBACKS

    setCallbacks(callbacks: MockTransportCallbacks): void {
      this.callbacks = callbacks
    }

    createRoom(): string {
      this.disconnect()
      this.code = '123456'
      this.isHost = true
      this.setStatus('connecting')
      this.setStatus('waiting')
      return this.code
    }

    joinRoom(code: string): void {
      this.disconnect()
      this.code = code
      this.isHost = false
      this.setStatus('connecting')
    }

    // Matches the real adapter: disconnect() resets state without
    // emitting a status callback.
    disconnect(): void {
      this.code = ''
      this.isHost = false
      this.status = 'disconnected'
    }

    send(): void {
      return
    }

    private setStatus(status: MockTransportStatus): void {
      this.status = status
      this.callbacks.onStatusChange(status)
    }
  }

  return { TrysteroTransportAdapter: MockTransportAdapter }
})

vi.mock('./adapters/stockfish-engine', () => {
  class MockStockfishEngineAdapter {
    async bestMoves(fens: readonly string[]): Promise<readonly string[]> {
      const { Chess } = await import('chessops/chess')
      const { parseFen } = await import('chessops/fen')
      const { makeUci, squareRank } = await import('chessops/util')
      return fens.map((fen) => {
        const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
        for (const [from, dests] of position.allDests()) {
          for (const to of dests) {
            const isPawn = position.board.getRole(from) === 'pawn'
            const toRank = squareRank(to)
            if (isPawn && (toRank === 0 || toRank === 7)) {
              return makeUci({ from, to, promotion: 'queen' })
            }
            return makeUci({ from, to })
          }
        }
        throw new Error(`No legal move in ${fen}`)
      })
    }
  }
  return { StockfishEngineAdapter: MockStockfishEngineAdapter }
})

type Listener = (event: FakeEvent) => void

interface FakeEvent {
  readonly target: FakeElement
  readonly key?: string
  preventDefault(): void
}

interface FakeStyle extends Record<string, string> {
  display?: string
  width?: string
  height?: string
}

class FakeCanvasContext {
  fillStyle = ''
  strokeStyle = ''
  lineWidth = 1
  lineCap: CanvasLineCap = 'butt'
  font = ''
  textAlign: CanvasTextAlign = 'start'
  textBaseline: CanvasTextBaseline = 'alphabetic'
  globalAlpha = 1
  clearRect(): void {
    return
  }
  fillRect(): void {
    return
  }
  strokeRect(): void {
    return
  }
  beginPath(): void {
    return
  }
  moveTo(): void {
    return
  }
  lineTo(): void {
    return
  }
  stroke(): void {
    return
  }
  fill(): void {
    return
  }
  fillText(): void {
    return
  }
  strokeText(): void {
    return
  }
  arc(): void {
    return
  }
  closePath(): void {
    return
  }
  save(): void {
    return
  }
  restore(): void {
    return
  }
  translate(): void {
    return
  }
  rotate(): void {
    return
  }
}

class FakeDocument {
  private readonly elements = new Map<string, FakeElement>()
  private sequence = 0

  register<T extends FakeElement>(id: string, element: T): T {
    this.elements.set(id, element)
    return element
  }

  getElementById(id: string): FakeElement | null {
    return this.elements.get(id) ?? null
  }

  createElement(tagName: string): FakeElement {
    const id = `generated-${tagName}-${this.sequence}`
    this.sequence += 1
    return new FakeHTMLElement(id, this)
  }
}

class FakeElement {
  readonly style: FakeStyle = {}
  textContent = ''
  className = ''
  clientWidth = 360
  clientHeight = 360
  scrollTop = 0
  scrollHeight = 0
  private html = ''
  private readonly attributes = new Map<string, string>()
  private readonly listeners = new Map<string, Listener[]>()
  private readonly children: FakeElement[] = []

  constructor(
    readonly id: string,
    private readonly documentRef: FakeDocument,
  ) {}

  set innerHTML(value: string) {
    this.html = value
    this.children.length = 0
    this.scrollHeight = 0
  }

  get innerHTML(): string {
    return this.html
  }

  addEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type)
    if (existing === undefined) {
      this.listeners.set(type, [listener])
      return
    }
    existing.push(listener)
  }

  querySelector<T extends FakeElement>(selector: string): T | null {
    if (!selector.startsWith('#')) {
      return null
    }
    const id = selector.slice(1)
    return (this.documentRef.getElementById(id) as T | null) ?? null
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child)
    this.scrollHeight = this.children.length * 16
    return child
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  click(): void {
    this.dispatch('click')
  }

  dispatch(type: string, key?: string): void {
    const handlers = this.listeners.get(type)
    if (handlers === undefined) {
      return
    }
    const event: FakeEvent = {
      target: this,
      ...(key !== undefined && { key }),
      preventDefault: () => {
        return
      },
    }
    for (const handler of handlers) {
      handler(event)
    }
  }
}

class FakeHTMLElement extends FakeElement {}

class FakeButtonElement extends FakeHTMLElement {
  disabled = false
}

class FakeInputElement extends FakeHTMLElement {
  value = ''
}

class FakeTextAreaElement extends FakeHTMLElement {
  value = ''
}

class FakeCanvasElement extends FakeHTMLElement {
  width = 0
  height = 0
  private readonly context = new FakeCanvasContext()

  getContext(kind: string): CanvasRenderingContext2D | null {
    if (kind !== '2d') {
      return null
    }
    return this.context as unknown as CanvasRenderingContext2D
  }
}

class FakeWindow {
  readonly devicePixelRatio = 1
  readonly location: { pathname: string }
  readonly history = {
    pushState: (): void => {
      return
    },
  }
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>()

  constructor(pathname = '/labs') {
    this.location = { pathname }
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const existing = this.listeners.get(type)
    if (existing === undefined) {
      this.listeners.set(type, [listener])
      return
    }
    existing.push(listener)
  }
}

interface TestDom {
  readonly documentRef: FakeDocument
  readonly windowRef: FakeWindow
}

function registerById<T extends FakeElement>(
  documentRef: FakeDocument,
  id: string,
  create: (elementId: string, owner: FakeDocument) => T,
): T {
  return documentRef.register(id, create(id, documentRef))
}

function setupDom(pathname = '/labs'): TestDom {
  const documentRef = new FakeDocument()
  const windowRef = new FakeWindow(pathname)

  registerById(
    documentRef,
    'screen-labs-menu',
    (id, owner) => new FakeHTMLElement(id, owner),
  )
  registerById(
    documentRef,
    'screen-superposition-lab',
    (id, owner) => new FakeHTMLElement(id, owner),
  )
  registerById(
    documentRef,
    'screen-chat-lab',
    (id, owner) => new FakeHTMLElement(id, owner),
  )
  registerById(
    documentRef,
    'screen-centurion-match',
    (id, owner) => new FakeHTMLElement(id, owner),
  )

  registerById(
    documentRef,
    'labs-menu-open-superposition',
    (id, owner) => new FakeButtonElement(id, owner),
  )
  registerById(
    documentRef,
    'labs-menu-open-chat',
    (id, owner) => new FakeButtonElement(id, owner),
  )
  registerById(
    documentRef,
    'labs-menu-open-centurion',
    (id, owner) => new FakeButtonElement(id, owner),
  )
  registerById(
    documentRef,
    'labs-menu-back-btn',
    (id, owner) => new FakeButtonElement(id, owner),
  )

  registerById(
    documentRef,
    'superposition-back-btn',
    (id, owner) => new FakeButtonElement(id, owner),
  )
  registerById(
    documentRef,
    'superposition-reset-btn',
    (id, owner) => new FakeButtonElement(id, owner),
  )
  registerById(
    documentRef,
    'superposition-fen-input',
    (id, owner) => new FakeTextAreaElement(id, owner),
  )
  registerById(
    documentRef,
    'superposition-arrow-input',
    (id, owner) => new FakeTextAreaElement(id, owner),
  )
  registerById(
    documentRef,
    'superposition-fen-diagnostics',
    (id, owner) => new FakeHTMLElement(id, owner),
  )
  registerById(
    documentRef,
    'superposition-arrow-diagnostics',
    (id, owner) => new FakeHTMLElement(id, owner),
  )

  const boardPanel = registerById(
    documentRef,
    'superposition-board-panel',
    (id, owner) => {
      const panel = new FakeHTMLElement(id, owner)
      panel.clientWidth = 400
      panel.clientHeight = 400
      return panel
    },
  )
  void boardPanel
  registerById(
    documentRef,
    'superposition-canvas',
    (id, owner) => new FakeCanvasElement(id, owner),
  )

  registerById(
    documentRef,
    'chat-back-btn',
    (id, owner) => new FakeButtonElement(id, owner),
  )
  registerById(
    documentRef,
    'chat-create-room-btn',
    (id, owner) => new FakeButtonElement(id, owner),
  )
  registerById(
    documentRef,
    'chat-join-room-btn',
    (id, owner) => new FakeButtonElement(id, owner),
  )
  registerById(
    documentRef,
    'chat-disconnect-btn',
    (id, owner) => new FakeButtonElement(id, owner),
  )
  registerById(
    documentRef,
    'chat-send-btn',
    (id, owner) => new FakeButtonElement(id, owner),
  )
  registerById(
    documentRef,
    'chat-join-code-input',
    (id, owner) => new FakeInputElement(id, owner),
  )
  registerById(
    documentRef,
    'chat-draft-input',
    (id, owner) => new FakeInputElement(id, owner),
  )
  registerById(
    documentRef,
    'chat-room-code',
    (id, owner) => new FakeHTMLElement(id, owner),
  )
  registerById(
    documentRef,
    'chat-status',
    (id, owner) => new FakeHTMLElement(id, owner),
  )
  registerById(
    documentRef,
    'chat-log',
    (id, owner) => new FakeHTMLElement(id, owner),
  )

  const centurionIds: readonly (readonly [
    string,
    'element' | 'button' | 'input' | 'canvas',
  ])[] = [
    ['centurion-back-btn', 'button'],
    ['centurion-lobby', 'element'],
    ['centurion-session', 'element'],
    ['centurion-status-copy', 'element'],
    ['centurion-pass-and-play-btn', 'button'],
    ['centurion-new-match-btn', 'button'],
    ['centurion-join-code-input', 'input'],
    ['centurion-join-match-btn', 'button'],
    ['centurion-cancel-btn', 'button'],
    ['centurion-score-line', 'element'],
    ['centurion-active-line', 'element'],
    ['centurion-turn-line', 'element'],
    ['centurion-session-notice', 'element'],
    ['centurion-result-banner', 'element'],
    ['centurion-arrow-input', 'input'],
    ['centurion-arrow-error', 'element'],
    ['centurion-submit-arrow-btn', 'button'],
    ['centurion-resolution-summary', 'element'],
    ['centurion-arrow-history', 'element'],
    ['centurion-leave-btn', 'button'],
  ]
  for (const [id, kind] of centurionIds) {
    if (kind === 'button') {
      registerById(
        documentRef,
        id,
        (i, owner) => new FakeButtonElement(i, owner),
      )
    } else if (kind === 'input') {
      registerById(
        documentRef,
        id,
        (i, owner) => new FakeInputElement(i, owner),
      )
    } else {
      registerById(documentRef, id, (i, owner) => new FakeHTMLElement(i, owner))
    }
  }
  registerById(documentRef, 'centurion-board-panel', (id, owner) => {
    const panel = new FakeHTMLElement(id, owner)
    panel.clientWidth = 400
    panel.clientHeight = 400
    return panel
  })
  registerById(
    documentRef,
    'centurion-canvas',
    (id, owner) => new FakeCanvasElement(id, owner),
  )

  vi.stubGlobal('document', documentRef as unknown as Document)
  vi.stubGlobal('window', windowRef as unknown as Window)
  vi.stubGlobal('HTMLElement', FakeHTMLElement)
  vi.stubGlobal('HTMLButtonElement', FakeButtonElement)
  vi.stubGlobal('HTMLInputElement', FakeInputElement)
  vi.stubGlobal('HTMLTextAreaElement', FakeTextAreaElement)
  vi.stubGlobal('HTMLCanvasElement', FakeCanvasElement)

  return { documentRef, windowRef }
}

describe('main app wiring', () => {
  it('shows one screen at a time and wires menu navigation', async () => {
    vi.resetModules()
    const { documentRef, windowRef } = setupDom('/labs')
    void windowRef

    await import('./main')

    const labsMenu = documentRef.getElementById(
      'screen-labs-menu',
    ) as FakeHTMLElement
    const superposition = documentRef.getElementById(
      'screen-superposition-lab',
    ) as FakeHTMLElement
    const chat = documentRef.getElementById(
      'screen-chat-lab',
    ) as FakeHTMLElement
    const centurion = documentRef.getElementById(
      'screen-centurion-match',
    ) as FakeHTMLElement

    expect(labsMenu.style.display).toBe('flex')
    expect(superposition.style.display).toBe('none')
    expect(chat.style.display).toBe('none')
    expect(centurion.style.display).toBe('none')

    const openSuperposition = documentRef.getElementById(
      'labs-menu-open-superposition',
    ) as FakeButtonElement
    openSuperposition.click()

    const fenInput = documentRef.getElementById(
      'superposition-fen-input',
    ) as FakeTextAreaElement
    const arrowInput = documentRef.getElementById(
      'superposition-arrow-input',
    ) as FakeTextAreaElement

    expect(labsMenu.style.display).toBe('none')
    expect(superposition.style.display).toBe('flex')
    expect(fenInput.value).toBe(DEFAULT_SUPERPOSITION_FEN_INPUT)
    expect(arrowInput.value).toBe(DEFAULT_SUPERPOSITION_ARROW_INPUT)

    const backFromSuperposition = documentRef.getElementById(
      'superposition-back-btn',
    ) as FakeButtonElement
    backFromSuperposition.click()
    expect(labsMenu.style.display).toBe('flex')
    expect(superposition.style.display).toBe('none')

    const openCenturion = documentRef.getElementById(
      'labs-menu-open-centurion',
    ) as FakeButtonElement
    openCenturion.click()

    const statusCopy = documentRef.getElementById(
      'centurion-status-copy',
    ) as FakeHTMLElement
    const newMatchButton = documentRef.getElementById(
      'centurion-new-match-btn',
    ) as FakeButtonElement
    const joinCodeInput = documentRef.getElementById(
      'centurion-join-code-input',
    ) as FakeInputElement
    const joinMatchButton = documentRef.getElementById(
      'centurion-join-match-btn',
    ) as FakeButtonElement

    expect(centurion.style.display).toBe('flex')
    expect(statusCopy.textContent).toContain('multiplayer match')

    // While hosting, the lobby actions are locked until cancelled.
    newMatchButton.click()
    expect(statusCopy.textContent).toContain('Share code 123456')
    expect(newMatchButton.disabled).toBe(true)
    expect(joinMatchButton.disabled).toBe(true)

    const cancelButton = documentRef.getElementById(
      'centurion-cancel-btn',
    ) as FakeButtonElement
    cancelButton.click()
    expect(newMatchButton.disabled).toBe(false)

    joinCodeInput.value = '654321'
    joinCodeInput.dispatch('input')
    joinMatchButton.click()
    expect(statusCopy.textContent).toBe('Joining match 654321...')
  })

  it('mounts the centurion lobby on initial root route', async () => {
    vi.resetModules()
    const { documentRef } = setupDom('/')

    await import('./main')

    const labsMenu = documentRef.getElementById(
      'screen-labs-menu',
    ) as FakeHTMLElement
    const centurion = documentRef.getElementById(
      'screen-centurion-match',
    ) as FakeHTMLElement
    const statusCopy = documentRef.getElementById(
      'centurion-status-copy',
    ) as FakeHTMLElement
    const newMatchButton = documentRef.getElementById(
      'centurion-new-match-btn',
    ) as FakeButtonElement

    expect(labsMenu.style.display).toBe('none')
    expect(centurion.style.display).toBe('flex')
    expect(statusCopy.textContent).toContain('multiplayer match')

    newMatchButton.click()
    expect(statusCopy.textContent).toContain('Share code')
  })

  it('plays a pass-and-play turn end to end', async () => {
    vi.resetModules()
    const { documentRef } = setupDom('/')

    await import('./main')

    const lobby = documentRef.getElementById(
      'centurion-lobby',
    ) as FakeHTMLElement
    const session = documentRef.getElementById(
      'centurion-session',
    ) as FakeHTMLElement
    const passAndPlayButton = documentRef.getElementById(
      'centurion-pass-and-play-btn',
    ) as FakeButtonElement

    expect(lobby.style.display).toBe('flex')
    expect(session.style.display).toBe('none')

    passAndPlayButton.click()
    expect(lobby.style.display).toBe('none')
    expect(session.style.display).toBe('grid')

    const scoreLine = documentRef.getElementById(
      'centurion-score-line',
    ) as FakeHTMLElement
    const activeLine = documentRef.getElementById(
      'centurion-active-line',
    ) as FakeHTMLElement
    const turnLine = documentRef.getElementById(
      'centurion-turn-line',
    ) as FakeHTMLElement
    expect(scoreLine.textContent).toBe('Player 1 0 : 0 Player 2')
    expect(activeLine.textContent).toBe('100 of 100 games active')
    expect(turnLine.textContent).toContain('Turn 1')

    const arrowInput = documentRef.getElementById(
      'centurion-arrow-input',
    ) as FakeInputElement
    const submitButton = documentRef.getElementById(
      'centurion-submit-arrow-btn',
    ) as FakeButtonElement
    const history = documentRef.getElementById(
      'centurion-arrow-history',
    ) as FakeHTMLElement

    arrowInput.value = 'e2->e4'
    arrowInput.dispatch('input')
    submitButton.click()

    // The arrow phase is synchronous; Stockfish (mocked) answers async.
    expect(turnLine.textContent).toContain('resolving')
    await vi.waitFor(() => {
      expect(turnLine.textContent).toContain('Turn 2')
    })
    expect(history.scrollHeight).toBeGreaterThan(0)

    const summary = documentRef.getElementById(
      'centurion-resolution-summary',
    ) as FakeHTMLElement
    expect(summary.textContent).toContain('followed arrows')

    const leaveButton = documentRef.getElementById(
      'centurion-leave-btn',
    ) as FakeButtonElement
    leaveButton.click()
    expect(lobby.style.display).toBe('flex')
    expect(session.style.display).toBe('none')
  })
})
