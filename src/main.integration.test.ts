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

    hostRoom(code: string): void {
      this.disconnect()
      this.code = code
      this.isHost = true
      this.setStatus('connecting')
      this.setStatus('waiting')
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

vi.mock('chessground', () => ({
  Chessground: vi.fn(() => ({
    set: vi.fn(),
    redrawAll: vi.fn(),
    destroy: vi.fn(),
  })),
}))

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

    async worstMoves(fens: readonly string[]): Promise<readonly string[]> {
      return this.bestMoves(fens)
    }
  }
  return { StockfishEngineAdapter: MockStockfishEngineAdapter }
})

type Listener = (event: FakeEvent) => void

interface FakeEvent {
  readonly target: FakeElement
  readonly key?: string
  readonly clientX?: number
  readonly clientY?: number
  preventDefault(): void
}

interface FakeEventInit {
  readonly key?: string
  readonly clientX?: number
  readonly clientY?: number
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
  setTransform(): void {
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
    if (tagName === 'option') {
      return new FakeOptionElement(id, this)
    }
    return new FakeHTMLElement(id, this)
  }
}

class FakeElement {
  readonly style: FakeStyle = {}
  textContent = ''
  className = ''
  hidden = false
  clientWidth = 360
  clientHeight = 360
  scrollTop = 0
  scrollHeight = 0
  private html = ''
  private readonly attributes = new Map<string, string>()
  private readonly listeners = new Map<string, Listener[]>()
  private readonly children: FakeElement[] = []
  private readonly classes = new Set<string>()
  readonly classList = {
    toggle: (name: string, force?: boolean): boolean => {
      const next = force ?? !this.classes.has(name)
      if (next) {
        this.classes.add(name)
      } else {
        this.classes.delete(name)
      }
      return next
    },
    contains: (name: string): boolean => this.classes.has(name),
  }

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

  dispatch(type: string, init: FakeEventInit = {}): void {
    const handlers = this.listeners.get(type)
    if (handlers === undefined) {
      return
    }
    const event: FakeEvent = {
      target: this,
      ...init,
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

class FakeOptionElement extends FakeHTMLElement {
  value = ''
}

class FakeSelectElement extends FakeHTMLElement {
  value = ''
  readonly dataset: Record<string, string> = {}
  private optionNodes: FakeOptionElement[] = []

  get options(): FakeOptionElement[] {
    return this.optionNodes
  }

  override set innerHTML(value: string) {
    super.innerHTML = value
    this.optionNodes = []
  }

  override appendChild(child: FakeElement): FakeElement {
    if (child instanceof FakeOptionElement) {
      this.optionNodes.push(child)
    }
    return super.appendChild(child)
  }
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

  getBoundingClientRect(): {
    left: number
    top: number
    width: number
    height: number
  } {
    return {
      left: 0,
      top: 0,
      width: this.clientWidth,
      height: this.clientHeight,
    }
  }

  /** Click the center of a square like 'e2' (white-at-bottom view). */
  clickSquare(square: string): void {
    const col = square.charCodeAt(0) - 'a'.charCodeAt(0)
    const rowFromTop = 8 - Number(square[1])
    this.dispatch('click', {
      clientX: ((col + 0.5) / 8) * this.clientWidth,
      clientY: ((rowFromTop + 0.5) / 8) * this.clientHeight,
    })
  }
}

class FakeWindow {
  readonly devicePixelRatio = 1
  readonly location: { pathname: string }
  readonly history = {
    pushState: (
      _state: unknown,
      _title: string,
      url?: string | URL | null,
    ): void => {
      if (typeof url === 'string') {
        this.location.pathname = new URL(url, 'https://example.com').pathname
      }
    },
    replaceState: (
      _state: unknown,
      _title: string,
      url?: string | URL | null,
    ): void => {
      if (typeof url === 'string') {
        this.location.pathname = new URL(url, 'https://example.com').pathname
      }
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
  registerById(
    documentRef,
    'superposition-mode-pieces',
    (id, owner) => new FakeButtonElement(id, owner),
  )
  registerById(
    documentRef,
    'superposition-mode-letters',
    (id, owner) => new FakeButtonElement(id, owner),
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
    'element' | 'button' | 'input' | 'canvas' | 'textarea' | 'select',
  ])[] = [
    ['centurion-back-btn', 'button'],
    ['centurion-lobby', 'element'],
    ['centurion-labs-foot', 'element'],
    ['centurion-open-labs-btn', 'button'],
    ['centurion-session', 'element'],
    ['centurion-status-copy', 'element'],
    ['centurion-solo-btn', 'button'],
    ['centurion-pass-and-play-btn', 'button'],
    ['centurion-new-match-btn', 'button'],
    ['centurion-join-code-input', 'input'],
    ['centurion-join-match-btn', 'button'],
    ['centurion-cancel-btn', 'button'],
    ['centurion-share-row', 'element'],
    ['centurion-share-btn', 'button'],
    ['centurion-copy-link-btn', 'button'],
    ['centurion-bar-top', 'element'],
    ['centurion-bar-bottom', 'element'],
    ['centurion-score-top', 'element'],
    ['centurion-score-bottom', 'element'],
    ['centurion-status-top', 'element'],
    ['centurion-status-bottom', 'element'],
    ['centurion-meta-line', 'element'],
    ['centurion-session-notice', 'element'],
    ['centurion-result-banner', 'element'],
    ['centurion-board-hint', 'element'],
    ['centurion-resolution-summary', 'element'],
    ['centurion-game-replay', 'element'],
    ['centurion-game-select', 'select'],
    ['centurion-replay-board', 'element'],
    ['centurion-replay-move-info', 'element'],
    ['centurion-replay-pgn', 'textarea'],
    ['centurion-replay-start', 'button'],
    ['centurion-replay-prev', 'button'],
    ['centurion-replay-next', 'button'],
    ['centurion-replay-end', 'button'],
    ['centurion-arrow-history', 'element'],
    ['centurion-leave-btn', 'button'],
    ['centurion-connection-log-list', 'element'],
    ['centurion-connection-log-clear', 'button'],
    ['centurion-connection-log-copy', 'button'],
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
    } else if (kind === 'textarea') {
      registerById(
        documentRef,
        id,
        (i, owner) => new FakeTextAreaElement(i, owner),
      )
    } else if (kind === 'select') {
      registerById(
        documentRef,
        id,
        (i, owner) => new FakeSelectElement(i, owner),
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
  vi.stubGlobal('confirm', () => true)
  vi.stubGlobal('HTMLElement', FakeHTMLElement)
  vi.stubGlobal('HTMLButtonElement', FakeButtonElement)
  vi.stubGlobal('HTMLInputElement', FakeInputElement)
  vi.stubGlobal('HTMLTextAreaElement', FakeTextAreaElement)
  vi.stubGlobal('HTMLSelectElement', FakeSelectElement)
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
    expect(statusCopy.textContent).toBe('')

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
    expect(statusCopy.textContent).toBe('')

    newMatchButton.click()
    expect(statusCopy.textContent).toContain('Share code')
  })

  it('routes and navigates under a GitHub Pages project subpath', async () => {
    vi.resetModules()
    const { documentRef, windowRef } = setupDom('/centurion/labs')

    await import('./main')

    const labsMenu = documentRef.getElementById(
      'screen-labs-menu',
    ) as FakeHTMLElement
    const centurion = documentRef.getElementById(
      'screen-centurion-match',
    ) as FakeHTMLElement
    const backToGame = documentRef.getElementById(
      'labs-menu-back-btn',
    ) as FakeButtonElement

    expect(labsMenu.style.display).toBe('flex')
    expect(centurion.style.display).toBe('none')

    backToGame.click()
    expect(windowRef.location.pathname).toBe('/centurion/')
    expect(labsMenu.style.display).toBe('none')
    expect(centurion.style.display).toBe('flex')
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

    const scoreTop = documentRef.getElementById(
      'centurion-score-top',
    ) as FakeHTMLElement
    const scoreBottom = documentRef.getElementById(
      'centurion-score-bottom',
    ) as FakeHTMLElement
    const statusTop = documentRef.getElementById(
      'centurion-status-top',
    ) as FakeHTMLElement
    const statusBottom = documentRef.getElementById(
      'centurion-status-bottom',
    ) as FakeHTMLElement
    const metaLine = documentRef.getElementById(
      'centurion-meta-line',
    ) as FakeHTMLElement
    expect(scoreTop.textContent).toBe('0')
    expect(scoreBottom.textContent).toBe('0')
    expect(metaLine.textContent).toContain('Turn 1')
    expect(metaLine.textContent).toContain('100/100 games')
    // Pass-and-play: exactly one side is prompted to place.
    expect(
      [statusTop.textContent, statusBottom.textContent].filter(
        (text) => text === 'Place an arrow',
      ),
    ).toHaveLength(1)

    const boardCanvas = documentRef.getElementById(
      'centurion-canvas',
    ) as FakeCanvasElement
    const boardHint = documentRef.getElementById(
      'centurion-board-hint',
    ) as FakeHTMLElement
    const history = documentRef.getElementById(
      'centurion-arrow-history',
    ) as FakeHTMLElement

    expect(boardHint.textContent).toContain('Tap the start square')
    boardCanvas.clickSquare('e2')
    expect(boardHint.textContent).toContain('tap the destination')
    boardCanvas.clickSquare('e4')

    // The arrow phase is synchronous; Stockfish (mocked) answers async.
    expect(metaLine.textContent).toContain('Resolving')
    await vi.waitFor(() => {
      expect(metaLine.textContent).toContain('Turn 2')
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
