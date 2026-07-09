import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_COMMAND_INPUT } from './features/command-lab/model'
import {
  DEFAULT_SUPERPOSITION_ARROW_INPUT,
  DEFAULT_SUPERPOSITION_FEN_INPUT,
} from './features/superposition-lab/model'

const recordedCommandLog = vi.hoisted(() => [] as unknown[])

vi.mock('./adapters/firebase-command-log', () => {
  class MockCommandLogAdapter {
    record(entry: unknown): void {
      recordedCommandLog.push(entry)
    }
  }
  return { FirebaseCommandLogAdapter: MockCommandLogAdapter }
})

vi.mock('./adapters/firebase-match-room', () => {
  interface MockRoomCallbacks {
    readonly onOpened: () => void
    readonly onError: (message: string) => void
    readonly onPeerPresence: (present: boolean) => void
    readonly onState: (state: unknown) => void
    readonly onLog?: (message: string) => void
  }

  const NOOP_CALLBACKS: MockRoomCallbacks = {
    onOpened: () => {
      return
    },
    onError: () => {
      return
    },
    onPeerPresence: () => {
      return
    },
    onState: () => {
      return
    },
  }

  class MockRoomAdapter {
    private callbacks: MockRoomCallbacks = NOOP_CALLBACKS

    setCallbacks(callbacks: MockRoomCallbacks): void {
      this.callbacks = callbacks
    }

    // Rooms always open instantly in tests, mirroring a reachable
    // database; the reducer sees the same synchronous callback shape
    // the real adapter produces asynchronously.
    open(): void {
      this.callbacks.onOpened()
    }

    publishState(): void {
      return
    }

    leave(): void {
      return
    }
  }

  return {
    FirebaseMatchRoomAdapter: MockRoomAdapter,
    generateRoomCode: () => '123456',
  }
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
    async rankedMoves(
      fens: readonly string[],
    ): Promise<readonly (readonly { uci: string; cp: number }[])[]> {
      const { Chess } = await import('chessops/chess')
      const { parseFen } = await import('chessops/fen')
      const { makeUci, squareRank } = await import('chessops/util')
      return fens.map((fen) => {
        const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
        const moves: { uci: string; cp: number }[] = []
        for (const [from, dests] of position.allDests()) {
          for (const to of dests) {
            const isPawn = position.board.getRole(from) === 'pawn'
            const toRank = squareRank(to)
            const uci =
              isPawn && (toRank === 0 || toRank === 7)
                ? makeUci({ from, to, promotion: 'queen' })
                : makeUci({ from, to })
            moves.push({ uci, cp: 0 })
          }
        }
        return moves
      })
    }
  }
  return { StockfishEngineAdapter: MockStockfishEngineAdapter }
})

vi.mock('./adapters/http-command-compiler', () => {
  class MockHttpCommandCompilerAdapter {
    async compile(_endpoint: string, command: string) {
      const { tryCompileLiteralNotation } = await import(
        './core/command/parse-notation'
      )
      const literal = tryCompileLiteralNotation(command)
      if (literal !== null) {
        return {
          tag: 'compiled' as const,
          predicate: literal,
        }
      }
      return {
        tag: 'compiled' as const,
        predicate: {
          tag: 'piece' as const,
          roles: ['knight' as const],
        },
      }
    }
  }
  return {
    HttpCommandCompilerAdapter: MockHttpCommandCompilerAdapter,
    defaultCommandCompilerEndpoint: () => '/api/compile',
  }
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
    this.textContent = value.replace(/<[^>]+>/g, '')
  }

  refreshAggregatedText(): void {
    this.textContent = this.children.map((child) => child.textContent).join('')
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
    this.refreshAggregatedText()
    return child
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      this.appendChild(child)
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
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
    const width = Number.parseFloat(this.style.width ?? '') || this.clientWidth
    const height =
      Number.parseFloat(this.style.height ?? '') || this.clientHeight
    return {
      left: 0,
      top: 0,
      width,
      height,
    }
  }

  /** Click the center of a square like 'e2' (white-at-bottom view). */
  clickSquare(square: string): void {
    const col = square.charCodeAt(0) - 'a'.charCodeAt(0)
    const rowFromTop = 8 - Number(square[1])
    const rect = this.getBoundingClientRect()
    this.dispatch('click', {
      clientX: rect.left + ((col + 0.5) / 8) * rect.width,
      clientY: rect.top + ((rowFromTop + 0.5) / 8) * rect.height,
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

  const commandLabIds: readonly (readonly [
    string,
    'element' | 'button' | 'input' | 'textarea',
  ])[] = [
    ['screen-command-lab', 'element'],
    ['labs-menu-open-command', 'button'],
    ['command-back-btn', 'button'],
    ['command-reset-btn', 'button'],
    ['command-compile-btn', 'button'],
    ['command-input', 'textarea'],
    ['command-endpoint-input', 'input'],
    ['command-fen-input', 'textarea'],
    ['command-diagnostics', 'element'],
    ['command-fen-diagnostics', 'element'],
    ['command-description', 'element'],
    ['command-predicate', 'element'],
    ['command-matches', 'element'],
  ]
  for (const [id, kind] of commandLabIds) {
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
    } else {
      registerById(documentRef, id, (i, owner) => new FakeHTMLElement(i, owner))
    }
  }

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
    ['centurion-practice-btn', 'button'],
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
    ['centurion-micro-pawn-eval', 'element'],
    ['centurion-micro-pawn-avg', 'element'],
    ['centurion-micro-pawn-histogram', 'element'],
    ['centurion-command-input', 'textarea'],
    ['centurion-issue-btn', 'button'],
    ['centurion-pass-btn', 'button'],
    ['centurion-command-status', 'element'],
    ['centurion-recent-commands', 'element'],
    ['centurion-stats-panel', 'element'],
    ['centurion-stats-content', 'element'],
    ['centurion-game-replay', 'element'],
    ['centurion-game-select', 'select'],
    ['centurion-replay-board', 'element'],
    ['centurion-replay-move-info', 'element'],
    ['centurion-replay-pgn', 'textarea'],
    ['centurion-replay-start', 'button'],
    ['centurion-replay-prev', 'button'],
    ['centurion-replay-next', 'button'],
    ['centurion-replay-end', 'button'],
    ['centurion-command-history', 'element'],
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
    const centurion = documentRef.getElementById(
      'screen-centurion-match',
    ) as FakeHTMLElement

    expect(labsMenu.style.display).toBe('flex')
    expect(superposition.style.display).toBe('none')
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

    const openCommandLab = documentRef.getElementById(
      'labs-menu-open-command',
    ) as FakeButtonElement
    openCommandLab.click()

    const commandLab = documentRef.getElementById(
      'screen-command-lab',
    ) as FakeHTMLElement
    const commandInput = documentRef.getElementById(
      'command-input',
    ) as FakeTextAreaElement
    expect(commandLab.style.display).toBe('flex')
    expect(commandInput.value).toBe(DEFAULT_COMMAND_INPUT)

    const backFromCommandLab = documentRef.getElementById(
      'command-back-btn',
    ) as FakeButtonElement
    backFromCommandLab.click()
    expect(labsMenu.style.display).toBe('flex')
    expect(commandLab.style.display).toBe('none')

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

    // The mocked room opens instantly, so the guest lands on the
    // waiting-for-host screen.
    joinCodeInput.value = '654321'
    joinCodeInput.dispatch('input')
    joinMatchButton.click()
    expect(statusCopy.textContent).toContain('Waiting for the host')
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
    expect(metaLine.textContent).toContain('1 active')
    expect(metaLine.textContent).toContain('1/100 in match')
    // Pass-and-play: exactly one side is prompted to command.
    expect(
      [statusTop.textContent, statusBottom.textContent].filter(
        (text) => text === 'Submit an order',
      ),
    ).toHaveLength(1)

    const commandBox = documentRef.getElementById(
      'centurion-command-input',
    ) as FakeTextAreaElement
    const submitButton = documentRef.getElementById(
      'centurion-issue-btn',
    ) as FakeButtonElement
    const commandStatus = documentRef.getElementById(
      'centurion-command-status',
    ) as FakeHTMLElement
    const history = documentRef.getElementById(
      'centurion-command-history',
    ) as FakeHTMLElement

    expect(commandStatus.textContent).toContain('Type an order')

    commandBox.value = 'move a knight'
    commandBox.dispatch('input')
    submitButton.click()
    await vi.waitFor(() => {
      expect(commandStatus.textContent).toContain('Submitting')
    })

    await vi.waitFor(() => {
      expect(metaLine.textContent).toContain('Turn 2')
    })
    expect(history.textContent).toContain('game')

    // The natural-language compile landed in the command log with the
    // match context it was compiled against.
    expect(recordedCommandLog).toContainEqual(
      expect.objectContaining({
        text: 'move a knight',
        source: 'local',
        outcome: expect.objectContaining({ tag: 'compiled' }),
        match: { turn: 1, matches: { matchedGames: 1, activeGames: 1 } },
      }),
    )

    const summary = documentRef.getElementById(
      'centurion-resolution-summary',
    ) as FakeHTMLElement
    expect(summary.textContent).toContain('followed the order')

    const leaveButton = documentRef.getElementById(
      'centurion-leave-btn',
    ) as FakeButtonElement
    leaveButton.click()
    expect(lobby.style.display).toBe('flex')
    expect(session.style.display).toBe('none')
  })

  it('plays e4 from the board in solo practice mode', async () => {
    vi.resetModules()
    const { documentRef } = setupDom('/')

    await import('./main')

    const practiceButton = documentRef.getElementById(
      'centurion-practice-btn',
    ) as FakeButtonElement
    const session = documentRef.getElementById(
      'centurion-session',
    ) as FakeHTMLElement
    const metaLine = documentRef.getElementById(
      'centurion-meta-line',
    ) as FakeHTMLElement
    const history = documentRef.getElementById(
      'centurion-command-history',
    ) as FakeHTMLElement
    const canvas = documentRef.getElementById(
      'centurion-canvas',
    ) as FakeCanvasElement

    practiceButton.click()
    expect(session.style.display).toBe('grid')
    expect(metaLine.textContent).toContain('1 active')
    expect(metaLine.textContent).toContain('1/1 in match')

    canvas.clickSquare('e2')
    canvas.clickSquare('e4')

    await vi.waitFor(() => {
      expect(metaLine.textContent).toContain('Turn 3')
    })
    expect(history.textContent).toContain('e4')
    expect(history.textContent).toContain('1 game')
  })
})
