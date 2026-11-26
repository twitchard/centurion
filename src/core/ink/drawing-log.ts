import type { BoardPoint, GestureName } from './gesture'

/**
 * Saved drawings live under `__trystero__` because that is the only
 * subtree the deployed database rules leave readable and writable.
 * A root path such as `drawings/` is rejected (permission denied); putting
 * the log here needs no rules change and does not open the rest of the
 * database.
 */
export const DRAWING_LOG_PATH = '__trystero__/centurion-drawings'

/** Firebase REST node. POST appends a child; GET reads the whole log. */
export function drawingLogEndpoint(databaseUrl: string): string {
  return `${databaseUrl.replace(/\/+$/, '')}/${DRAWING_LOG_PATH}.json`
}

/** One saved drawing, addressed by the key POST returned. */
export function drawingLogEntryEndpoint(
  databaseUrl: string,
  id: string,
): string {
  return `${databaseUrl.replace(/\/+$/, '')}/${DRAWING_LOG_PATH}/${id}.json`
}

export const DRAWING_CORRECTIONS = [
  'arrow',
  'circle',
  'scribble',
  'x',
  'ignore',
] as const

/** A fix-it choice. `ignore` means the shape was not a real mark. */
export type DrawingCorrection = (typeof DRAWING_CORRECTIONS)[number]

export interface NewSavedDrawing {
  readonly author: 'owner'
  readonly strokes: readonly (readonly BoardPoint[])[]
  readonly recognized: readonly GestureName[]
  readonly readings: readonly string[]
  readonly build: string
}

/**
 * One committed drawing. `expect` stays null until a fix-it tap; an
 * uncorrected drawing is implicitly confirmed as `recognized`.
 */
export interface SavedDrawing {
  readonly id: string
  readonly author: 'owner'
  readonly expect: readonly DrawingCorrection[] | null
  readonly strokes: readonly (readonly BoardPoint[])[]
  readonly recognized: readonly GestureName[]
  readonly readings: readonly string[]
  readonly at: number
  readonly build: string
  readonly corrected: boolean
}

export interface ExportedRecording {
  readonly id: string
  readonly author: 'owner'
  readonly expect: readonly DrawingCorrection[]
  readonly strokes: readonly (readonly BoardPoint[])[]
  readonly recognized: readonly GestureName[]
  readonly readings: readonly string[]
  readonly corrected: boolean
  readonly at: number
  readonly build: string
}

/**
 * Wire format. `expect` is omitted until a correction: Firebase drops
 * nulls, so a missing field is the uncorrected state. `at` is the server
 * timestamp sentinel and reads back as epoch milliseconds.
 */
export function encodeNewDrawing(
  entry: NewSavedDrawing,
): Record<string, unknown> {
  return {
    author: entry.author,
    strokes: entry.strokes,
    recognized: entry.recognized,
    readings: entry.readings,
    at: { '.sv': 'timestamp' },
    build: entry.build,
    corrected: false,
  }
}

/**
 * The expect array written by a fix-it tap. Untouched shapes keep the
 * name the recognizer gave them. Null when nothing has been tapped.
 */
export function correctionExpect(
  recognized: readonly GestureName[],
  choices: readonly (DrawingCorrection | null)[],
): readonly DrawingCorrection[] | null {
  if (
    choices.length !== recognized.length ||
    choices.every((choice) => choice === null)
  ) {
    return null
  }
  return recognized.map((name, index) => choices[index] ?? name)
}

/** Labels a fixture should assert. Uncorrected drawings use the recognizer. */
export function confirmedExpect(
  drawing: SavedDrawing,
): readonly DrawingCorrection[] {
  return drawing.expect ?? drawing.recognized
}

export function exportRecordings(
  drawings: readonly SavedDrawing[],
): readonly ExportedRecording[] {
  return drawings.map((drawing) => ({
    id: drawing.id,
    author: 'owner',
    expect: confirmedExpect(drawing),
    strokes: drawing.strokes,
    recognized: drawing.recognized,
    readings: drawing.readings,
    corrected: drawing.corrected,
    at: drawing.at,
    build: drawing.build,
  }))
}

/**
 * Decode one untrusted log record (anyone can write the node). Returns
 * null for anything malformed so one junk child cannot break the export.
 */
export function decodeSavedDrawing(
  id: string,
  input: unknown,
): SavedDrawing | null {
  if (!isRecord(input) || id.length === 0) {
    return null
  }
  if (field(input, 'author') !== 'owner') {
    return null
  }
  const strokes = decodeStrokes(field(input, 'strokes'))
  const recognized = decodeNames(field(input, 'recognized'))
  const readings = decodeStrings(field(input, 'readings'))
  const build = field(input, 'build')
  const at = field(input, 'at')
  const corrected = field(input, 'corrected')
  if (
    strokes === null ||
    strokes.length === 0 ||
    recognized === null ||
    recognized.length === 0 ||
    readings === null ||
    readings.length !== recognized.length ||
    typeof build !== 'string' ||
    typeof at !== 'number' ||
    typeof corrected !== 'boolean'
  ) {
    return null
  }
  const expect = decodeExpect(field(input, 'expect'), recognized.length)
  if (expect === undefined) {
    return null
  }
  if (corrected && expect === null) {
    return null
  }
  return {
    id,
    author: 'owner',
    expect,
    strokes,
    recognized,
    readings,
    at,
    build,
    corrected,
  }
}

function decodeExpect(
  value: unknown,
  count: number,
): readonly DrawingCorrection[] | null | undefined {
  if (value === undefined || value === null) {
    return null
  }
  const items = asArray(value)
  if (items === null || items.length !== count) {
    return undefined
  }
  const labels: DrawingCorrection[] = []
  for (const item of items) {
    if (!isCorrection(item)) {
      return undefined
    }
    labels.push(item)
  }
  return labels
}

function decodeNames(value: unknown): GestureName[] | null {
  const items = asArray(value)
  if (items === null) {
    return null
  }
  const names: GestureName[] = []
  for (const item of items) {
    if (!isGestureName(item)) {
      return null
    }
    names.push(item)
  }
  return names
}

function decodeStrings(value: unknown): string[] | null {
  const items = asArray(value)
  if (items === null) {
    return null
  }
  const strings: string[] = []
  for (const item of items) {
    if (typeof item !== 'string') {
      return null
    }
    strings.push(item)
  }
  return strings
}

function decodeStrokes(
  value: unknown,
): readonly (readonly BoardPoint[])[] | null {
  const strokes = asArray(value)
  if (strokes === null) {
    return null
  }
  const decoded: BoardPoint[][] = []
  for (const stroke of strokes) {
    const points = asArray(stroke)
    if (points === null || points.length === 0) {
      return null
    }
    const decodedPoints: BoardPoint[] = []
    for (const point of points) {
      if (!isRecord(point)) {
        return null
      }
      const x = field(point, 'x')
      const y = field(point, 'y')
      if (typeof x !== 'number' || typeof y !== 'number') {
        return null
      }
      decodedPoints.push({ x, y })
    }
    decoded.push(decodedPoints)
  }
  return decoded
}

function asArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value
  }
  if (!isRecord(value)) {
    return null
  }
  const keys = Object.keys(value)
  if (keys.length === 0) {
    return []
  }
  const indexes = keys.map((key) => Number(key))
  if (indexes.some((index) => !Number.isInteger(index) || index < 0)) {
    return null
  }
  indexes.sort((left, right) => left - right)
  return indexes.map((index) => value[String(index)])
}

function field(value: Record<string, unknown>, key: string): unknown {
  return value[key]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isGestureName(value: unknown): value is GestureName {
  return (
    value === 'arrow' ||
    value === 'circle' ||
    value === 'scribble' ||
    value === 'x'
  )
}

function isCorrection(value: unknown): value is DrawingCorrection {
  return isGestureName(value) || value === 'ignore'
}
