import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SUPERPOSITION_ARROW_INPUT,
  DEFAULT_SUPERPOSITION_FEN_INPUT,
} from './features/superposition-lab/model'

vi.mock('./adapters/trystero-transport', () => {
  class MockTransportAdapter {
    code = ''
    isHost = false
    setCallbacks(): void {
      return
    }
    createRoom(): string {
      this.code = '123456'
      this.isHost = true
      return this.code
    }
    joinRoom(code: string): void {
      this.code = code
      this.isHost = false
    }
    disconnect(): void {
      this.code = ''
      this.isHost = false
    }
    send(): void {
      return
    }
  }

  return { TrysteroTransportAdapter: MockTransportAdapter }
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
  readonly location = { pathname: '/labs' }
  readonly history = {
    pushState: (): void => {
      return
    },
  }
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>()

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

function setupDom(): TestDom {
  const documentRef = new FakeDocument()
  const windowRef = new FakeWindow()

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

  registerById(
    documentRef,
    'centurion-back-btn',
    (id, owner) => new FakeButtonElement(id, owner),
  )
  registerById(
    documentRef,
    'centurion-status-copy',
    (id, owner) => new FakeHTMLElement(id, owner),
  )
  registerById(
    documentRef,
    'centurion-new-match-btn',
    (id, owner) => new FakeButtonElement(id, owner),
  )
  registerById(
    documentRef,
    'centurion-join-code-input',
    (id, owner) => new FakeInputElement(id, owner),
  )
  registerById(
    documentRef,
    'centurion-join-match-btn',
    (id, owner) => new FakeButtonElement(id, owner),
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
    const { documentRef, windowRef } = setupDom()
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
    expect(statusCopy.textContent).toBe(
      'Start a new match or join one with a code.',
    )

    newMatchButton.click()
    expect(statusCopy.textContent).toContain('Share code')

    joinCodeInput.value = '123456'
    joinCodeInput.dispatch('input')
    joinMatchButton.click()
    expect(statusCopy.textContent).toBe('Joining match 123456...')
  })
})
