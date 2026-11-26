import type { DrawingCorrection } from '../../core/ink/drawing-log'

export interface FixItView {
  readonly readings: readonly string[]
  readonly choices: readonly (DrawingCorrection | null)[]
  readonly openIndex: number | null
  readonly failed: boolean
}

const CHOICES: readonly {
  readonly id: DrawingCorrection
  readonly label: string
}[] = [
  { id: 'arrow', label: 'Arrow' },
  { id: 'circle', label: 'Circle' },
  { id: 'x', label: 'X' },
  { id: 'scribble', label: 'Scribble' },
  { id: 'ignore', label: 'Nothing' },
]

/**
 * A quiet strip of the last drawing's shape names. Tapping one opens a
 * picker; choosing a label calls back and does not touch the board.
 */
export function renderFixIt(
  host: HTMLElement,
  view: FixItView | null,
  onToggle: (index: number) => void,
  onChoose: (index: number, choice: DrawingCorrection) => void,
): void {
  host.innerHTML = ''
  if (view === null || view.readings.length === 0) {
    host.hidden = true
    return
  }
  host.hidden = false
  view.readings.forEach((reading, index) => {
    const choice = view.choices[index] ?? null
    const button = document.createElement('button')
    button.type = 'button'
    button.className =
      view.openIndex === index
        ? 'ink-fixit-shape is-open'
        : choice === null
          ? 'ink-fixit-shape'
          : 'ink-fixit-shape is-corrected'
    button.textContent = shapeLabel(reading, choice)
    button.title = 'Tap if this was read wrong'
    button.addEventListener('click', () => {
      onToggle(index)
    })
    host.appendChild(button)
  })
  if (view.openIndex !== null) {
    const picker = document.createElement('div')
    picker.className = 'ink-fixit-picker'
    picker.setAttribute('role', 'group')
    picker.setAttribute('aria-label', 'What was this shape?')
    for (const choice of CHOICES) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'ink-fixit-choice'
      button.textContent = choice.label
      const index = view.openIndex
      button.addEventListener('click', () => {
        onChoose(index, choice.id)
      })
      picker.appendChild(button)
    }
    host.appendChild(picker)
  }
  if (view.failed) {
    const note = document.createElement('p')
    note.className = 'ink-fixit-note'
    note.textContent = 'Not saved'
    host.appendChild(note)
  }
}

function shapeLabel(reading: string, choice: DrawingCorrection | null): string {
  if (choice === null) {
    return reading
  }
  const picked = CHOICES.find((item) => item.id === choice)?.label ?? choice
  return `${reading} → ${picked}`
}
