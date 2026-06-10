import {
  DEFAULT_SUPERPOSITION_ARROW_INPUT,
  DEFAULT_SUPERPOSITION_FEN_INPUT,
  buildSuperpositionLabModel,
} from './features/superposition-lab/model'
import type { SuperpositionLabModel } from './features/superposition-lab/model'
import {
  type PieceDisplayMode,
  SuperpositionRenderer,
} from './features/superposition-lab/render-superposition'

function el<T extends HTMLElement>(id: string, Type: new () => T): T {
  const node = document.getElementById(id)
  if (!(node instanceof Type)) {
    throw new Error(`Missing or wrong type for #${id}`)
  }
  return node
}

const fenInput = el('board-fen-input', HTMLTextAreaElement)
const arrowInput = el('board-arrow-input', HTMLTextAreaElement)
const fenDiagnostics = el('board-fen-diagnostics', HTMLUListElement)
const arrowDiagnostics = el('board-arrow-diagnostics', HTMLUListElement)
const boardWrap = el('board-wrap', HTMLDivElement)
const boardCanvas = el('board-canvas', HTMLCanvasElement)
const modeButtons: ReadonlyArray<{
  readonly button: HTMLButtonElement
  readonly mode: PieceDisplayMode
}> = [
  { button: el('board-mode-pieces', HTMLButtonElement), mode: 'pieces' },
  { button: el('board-mode-letters', HTMLButtonElement), mode: 'letters' },
]

const renderer = new SuperpositionRenderer(boardCanvas)

function parsedFen(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('fens') ?? DEFAULT_SUPERPOSITION_FEN_INPUT
}

function parsedArrows(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('arrows') ?? DEFAULT_SUPERPOSITION_ARROW_INPUT
}

let model: SuperpositionLabModel = buildSuperpositionLabModel(
  parsedFen(),
  parsedArrows(),
)

function renderDiagnostics(
  target: HTMLUListElement,
  result:
    | SuperpositionLabModel['fenParse']
    | SuperpositionLabModel['arrowParse'],
  okMessage: string,
): void {
  target.innerHTML = ''
  if (result.tag === 'valid') {
    const li = document.createElement('li')
    li.className = 'ok'
    li.textContent = okMessage
    target.appendChild(li)
    return
  }
  for (const d of result.diagnostics) {
    const li = document.createElement('li')
    li.className = 'err'
    li.textContent = d
    target.appendChild(li)
  }
}

function resizeAndRender(): void {
  const size = Math.min(
    boardWrap.clientWidth,
    boardWrap.clientHeight > 0 ? boardWrap.clientHeight : boardWrap.clientWidth,
    720,
  )
  renderer.resize(size)
  renderer.render(model.renderModel)
}

function render(): void {
  fenInput.value = model.fenInput
  arrowInput.value = model.arrowInput

  const fenOk =
    model.fenParse.tag === 'valid'
      ? `Parsed ${model.renderModel.positionCount} position(s).`
      : ''
  const arrowOk =
    model.arrowParse.tag === 'valid'
      ? `Parsed ${model.arrowParse.value.length} arrow(s).`
      : ''

  renderDiagnostics(fenDiagnostics, model.fenParse, fenOk)
  renderDiagnostics(arrowDiagnostics, model.arrowParse, arrowOk)
  resizeAndRender()
}

fenInput.addEventListener('input', () => {
  model = buildSuperpositionLabModel(fenInput.value, model.arrowInput)
  render()
})

arrowInput.addEventListener('input', () => {
  model = buildSuperpositionLabModel(model.fenInput, arrowInput.value)
  render()
})

function applyDisplayMode(mode: PieceDisplayMode): void {
  renderer.displayMode = mode
  for (const entry of modeButtons) {
    entry.button.classList.toggle('active', entry.mode === mode)
  }
}

for (const entry of modeButtons) {
  entry.button.addEventListener('click', () => {
    applyDisplayMode(entry.mode)
    resizeAndRender()
  })
}

window.addEventListener('resize', () => resizeAndRender())

applyDisplayMode('pieces')
render()
