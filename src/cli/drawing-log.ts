import {
  type SavedDrawing,
  decodeSavedDrawing,
  drawingLogEndpoint,
  exportRecordings,
} from '../core/ink/drawing-log'

/**
 * Exports drawings saved during play into the recordings JSON format:
 *
 *   bun run drawings:export                 # JSON on stdout
 *   bun run drawings:export --out ink.json  # write that file instead
 *
 * Uncorrected drawings are exported with the recognizer's labels as
 * `expect` (implicitly confirmed). A shape the player marked Nothing is
 * `ignore`; the fixture parser leaves a recording unlabeled if any shape
 * is ignore.
 *
 * DRAWING_LOG_DATABASE_URL overrides the database (defaults to the same
 * built-in database multiplayer uses). No credentials: the rules already
 * allow public read of this node.
 */

const DEFAULT_DATABASE_URL =
  'https://centurion-chess-default-rtdb.firebaseio.com'

function parseArgs(args: readonly string[]): { readonly out: string | null } {
  let out: string | null = null
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--out') {
      const path = args[index + 1]
      if (path === undefined || path.startsWith('--')) {
        console.error('--out expects a file path.')
        process.exit(1)
      }
      out = path
      index += 1
      continue
    }
    console.error(`Unknown argument: ${arg}`)
    console.error('Usage: bun run drawings:export [--out file.json]')
    process.exit(1)
  }
  return { out }
}

const options = parseArgs(process.argv.slice(2))
const { DRAWING_LOG_DATABASE_URL } = process.env
const endpoint = drawingLogEndpoint(
  DRAWING_LOG_DATABASE_URL ?? DEFAULT_DATABASE_URL,
)

async function fetchLog(): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint)
  if (!response.ok) {
    throw new Error(`GET ${endpoint} responded ${response.status}`)
  }
  const body: unknown = await response.json()
  if (body === null) {
    return {}
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('The drawings node holds something other than records.')
  }
  return body as Record<string, unknown>
}

let raw: Record<string, unknown>
try {
  raw = await fetchLog()
} catch (error) {
  console.error(
    `Could not read saved drawings: ${
      error instanceof Error ? error.message : String(error)
    }`,
  )
  process.exit(1)
}

const drawings: SavedDrawing[] = []
let undecodable = 0
for (const id of Object.keys(raw).sort()) {
  const decoded = decodeSavedDrawing(id, raw[id])
  if (decoded === null) {
    undecodable += 1
    continue
  }
  drawings.push(decoded)
}

const recordings = exportRecordings(drawings)
const json = JSON.stringify({ recordings }, null, 2)
const ignored = recordings.filter((recording) =>
  recording.expect.includes('ignore'),
).length
const corrected = recordings.filter((recording) => recording.corrected).length
const summary = [
  `${recordings.length} drawing${recordings.length === 1 ? '' : 's'}`,
  `${corrected} corrected`,
  ignored === 0
    ? null
    : `${ignored} include Nothing (the fixture parser leaves those unlabeled)`,
  undecodable === 0 ? null : `${undecodable} undecodable skipped`,
]
  .filter((part) => part !== null)
  .join(', ')

if (options.out === null) {
  console.log(json)
  console.error(summary)
} else {
  await Bun.write(options.out, `${json}\n`)
  console.log(`Wrote ${options.out} (${summary}).`)
}
