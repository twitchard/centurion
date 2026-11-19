import { describeMark } from '../../core/ink/gesture'
import { inkMover } from '../../core/ink/match'
import { previewShiftLine } from '../../core/ink/preview'
import { inkToMatchState } from '../../core/ink/project'
import { inkStatCards } from '../../core/ink/stats'
import {
  TEMPERAMENTS,
  TEMPERAMENT_IDS,
  temperamentCurve,
} from '../../core/ink/temperament'
import {
  aggregateMicroPawnStats,
  formatMicroPawns,
  microPawnHistogram,
  microPawnHistogramLabel,
} from '../../core/match/eval'
import { matchRenderModel } from '../../core/match/render'
import type { SuperpositionRenderer } from '../superposition-lab/render-superposition'
import type { InkDrawLayer } from './draw-layer'
import { type InkModel, canDraw, sessionPreview } from './model'

export interface InkView {
  readonly scoreTop: HTMLElement
  readonly scoreBottom: HTMLElement
  readonly statusTop: HTMLElement
  readonly statusBottom: HTMLElement
  readonly barTop: HTMLElement
  readonly barBottom: HTMLElement
  readonly baseline: HTMLElement
  readonly hint: HTMLElement
  readonly preview: HTMLElement
  readonly commitMeter: HTMLElement
  readonly commitLabel: HTMLElement
  readonly markList: HTMLElement
  readonly pass: HTMLButtonElement
  readonly undo: HTMLButtonElement
  readonly clear: HTMLButtonElement
  readonly hard: HTMLButtonElement
  readonly temperaments: HTMLElement
  readonly family: HTMLElement
  readonly notice: HTMLElement
  readonly statsPanel: HTMLElement
  readonly statsContent: HTMLElement
  readonly histogram: HTMLElement
  readonly histogramAvg: HTMLElement
  readonly evalWrap: HTMLElement
  readonly result: HTMLElement
  readonly turnLabel: HTMLElement
}

const BAR_COLORS: Record<(typeof TEMPERAMENT_IDS)[number], string> = {
  strong: '#1d4ed8',
  weak: '#b91c1c',
  steady: '#57534e',
  swingy: '#7c3aed',
}

export function renderInk(
  view: InkView,
  model: InkModel,
  options: {
    readonly animating: boolean
    readonly renderer: SuperpositionRenderer
    readonly draw: InkDrawLayer
    readonly boardPanel: HTMLElement
  },
): void {
  const session = model.session
  const match = session.match
  const finished = match.phase.tag === 'finished'
  const mover = inkMover(match)
  const drawing =
    canDraw(model) && !options.animating && !finished && mover === 'player'
  const computerThinking =
    session.searchSide === 'computer' || mover === 'computer'
  const reading = session.searchSide === 'player' && session.ranks === null

  view.scoreTop.textContent = String(match.scores.p2)
  view.scoreBottom.textContent = String(match.scores.p1)
  view.statusTop.textContent =
    match.difficulty === 'hard' ? 'Computer · hard' : 'Computer'
  view.statusBottom.textContent = finished
    ? 'Match over'
    : computerThinking && mover !== 'player'
      ? 'Moving'
      : 'You'
  view.turnLabel.textContent = finished
    ? 'Match over'
    : computerThinking && session.searchSide === 'computer'
      ? 'Computer is moving'
      : reading
        ? 'Reading the board'
        : 'Your move'

  view.barTop.classList.toggle(
    'ink-bar-active',
    !finished && (session.searchSide === 'computer' || mover === 'computer'),
  )
  view.barBottom.classList.toggle('ink-bar-active', drawing || reading)

  renderBaseline(view, match.inkValueCp, match.gameCount)
  renderHistogram(view, match)
  renderPreview(view, model, reading)
  renderCommitCue(view, session.strokes.length > 0 && drawing, session.marks)
  renderTemperaments(view, match.difficulty)
  renderStats(view, match)
  view.notice.textContent = session.notice ?? ''
  view.result.textContent = resultText(match.phase)
  view.result.hidden = view.result.textContent.length === 0

  const ready =
    drawing && session.ranks !== null && session.searchId === null && !finished
  view.pass.disabled = !ready || session.strokes.length > 0
  view.pass.hidden = session.strokes.length > 0
  view.undo.disabled = !drawing || session.strokes.length === 0
  view.clear.disabled = !drawing || session.strokes.length === 0
  view.hard.textContent =
    match.difficulty === 'hard' ? 'Fair opponent' : 'Hard opponent'

  const hint = session.notice
  view.hint.textContent =
    hint ??
    (session.strokes.length > 0 && drawing
      ? 'Pause sends this drawing. Undo or clear before the bar empties.'
      : drawing
        ? 'Draw an arrow, a circle, or a scribble. A short pause sends it.'
        : computerThinking
          ? 'Watch the reply, then draw again.'
          : '')

  options.draw.setEnabled(drawing)
  if (!options.animating) {
    const size = boardSize(options.boardPanel)
    options.renderer.resize(size)
    options.draw.resize(size)
    options.renderer.render(matchRenderModel(inkToMatchState(match), 1))
    options.draw.render(session.marks)
  } else {
    options.draw.render(session.marks)
  }
}

function renderBaseline(
  view: InkView,
  inkValueCp: number,
  gameCount: number,
): void {
  const perGame = gameCount > 0 ? inkValueCp / gameCount : 0
  const text = formatMicroPawns(perGame)
  view.baseline.textContent = `Versus unled ${text}`
  view.baseline.title =
    'Expected eval your drawings have added, per game, compared with each soldier drawing on its own.'
  view.baseline.className =
    perGame > 1
      ? 'ink-baseline ink-baseline-ahead'
      : perGame < -1
        ? 'ink-baseline ink-baseline-behind'
        : 'ink-baseline'
}

function renderHistogram(
  view: InkView,
  match: InkModel['session']['match'],
): void {
  const projected = inkToMatchState(match)
  const stats = aggregateMicroPawnStats(projected, 1)
  view.evalWrap.hidden = stats.activeGames === 0
  if (stats.activeGames === 0) {
    view.histogramAvg.textContent = ''
    view.histogram.innerHTML = ''
    return
  }
  view.histogramAvg.textContent = formatMicroPawns(stats.medianCp)
  view.histogramAvg.title = 'Median position across active games'
  view.histogram.setAttribute(
    'aria-label',
    microPawnHistogramLabel(projected, 1),
  )
  const bins = microPawnHistogram(projected, 1)
  const center = Math.floor(bins.length / 2)
  const peak = Math.max(...bins, 1)
  view.histogram.innerHTML = ''
  for (let index = 0; index < bins.length; index++) {
    const count = bins[index] ?? 0
    const bar = document.createElement('span')
    const tone =
      index < center
        ? 'centurion-micro-pawn-histogram-bar--behind'
        : index > center
          ? 'centurion-micro-pawn-histogram-bar--ahead'
          : 'centurion-micro-pawn-histogram-bar--even'
    bar.className = `centurion-micro-pawn-histogram-bar ${tone}`
    bar.style.height = `${Math.max(8, Math.round((count / peak) * 100))}%`
    view.histogram.appendChild(bar)
  }
}

function renderPreview(view: InkView, model: InkModel, reading: boolean): void {
  if (reading) {
    view.preview.textContent = 'Reading the positions…'
    return
  }
  const preview = sessionPreview(model)
  if (preview === null) {
    view.preview.textContent = ''
    return
  }
  const perGame =
    preview.games > 0 ? preview.expectedCpDelta / preview.games : 0
  const value =
    preview.markLabels.length === 0
      ? ''
      : ` This drawing expects ${formatMicroPawns(perGame)} versus unled.`
  const marks =
    preview.markLabels.length === 0 ? '' : ` ${preview.markLabels.join(' · ')}.`
  view.preview.textContent = `${previewShiftLine(preview)}${value}${marks}`
}

function renderCommitCue(
  view: InkView,
  pending: boolean,
  marks: InkModel['session']['marks'],
): void {
  view.commitMeter.hidden = !pending
  view.commitLabel.hidden = !pending
  if (!pending) {
    view.commitLabel.textContent = ''
  }
  view.markList.innerHTML = ''
  for (const mark of marks) {
    const item = document.createElement('li')
    item.textContent = describeMark(mark)
    view.markList.appendChild(item)
  }
}

function renderTemperaments(
  view: InkView,
  difficulty: InkModel['session']['match']['difficulty'],
): void {
  view.temperaments.innerHTML = ''
  for (const id of TEMPERAMENT_IDS) {
    const spec = TEMPERAMENTS[id]
    const card = document.createElement('div')
    card.className = 'ink-temp'
    const bars = document.createElement('div')
    bars.className = 'ink-temp-bars'
    bars.setAttribute('role', 'img')
    bars.setAttribute('aria-label', `${spec.label}: ${spec.blurb}`)
    const curve = temperamentCurve(id)
    const peak = Math.max(...curve, 0.001)
    for (let rank = 0; rank < curve.length; rank++) {
      const weight = curve[rank] ?? 0
      const bar = document.createElement('span')
      bar.className = 'ink-temp-bar'
      bar.style.height = `${Math.max(6, Math.round((weight / peak) * 100))}%`
      bar.style.background = BAR_COLORS[id]
      bar.title = `Rank ${rank + 1}: ${Math.round(weight * 100)}%`
      bars.appendChild(bar)
    }
    const label = document.createElement('div')
    label.className = 'ink-temp-label'
    label.textContent = `${spec.label} 25`
    card.append(bars, label)
    view.temperaments.appendChild(card)
  }
  view.family.textContent =
    difficulty === 'hard'
      ? 'Your soldiers: 25 of each curve. The computer deck is half strong and has no weak soldiers. Ink makes matching moves more likely; a scribble makes them less likely.'
      : 'Each soldier draws from a curve over the top ten: strong leans best, weak leans worst, steady sits in the middle, swingy lives at both ends. 25 of each. Ink makes matching moves more likely; a scribble makes them less likely.'
}

function renderStats(view: InkView, match: InkModel['session']['match']): void {
  const cards = inkStatCards(match)
  const show = match.games.some((game) => game.status.tag === 'active')
  view.statsPanel.hidden = !show
  view.statsContent.innerHTML = ''
  if (!show) {
    return
  }
  for (const card of cards) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'centurion-stat-card'
    button.setAttribute('role', 'listitem')
    button.setAttribute('aria-label', `${card.label}: ${card.value}`)
    const icon = document.createElement('span')
    icon.className = 'centurion-stat-icon'
    icon.setAttribute('aria-hidden', 'true')
    icon.textContent = card.icon
    const value = document.createElement('span')
    value.className = 'centurion-stat-value'
    value.textContent = card.value
    const tip = document.createElement('span')
    tip.className = 'centurion-stat-tip'
    tip.setAttribute('role', 'tooltip')
    tip.textContent = card.tip
    button.append(icon, value, tip)
    view.statsContent.appendChild(button)
  }
}

function resultText(phase: InkModel['session']['match']['phase']): string {
  if (phase.tag !== 'finished') {
    return ''
  }
  if (phase.winner === 'draw') {
    return 'Draw.'
  }
  return phase.winner === 1 ? 'You win.' : 'Computer wins.'
}

function boardSize(panel: HTMLElement): number {
  return Math.min(
    panel.clientWidth,
    panel.clientHeight > 0 ? panel.clientHeight : panel.clientWidth,
    720,
  )
}
