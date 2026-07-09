import {
  type CommandLogEntry,
  commandLogEndpoint,
  decodeCommandLogEntry,
  formatCommandLogEntry,
} from '../core/command-log/model'

/**
 * Reads the shared command log — every natural-language command players
 * sent to the compiler, with its predicate, English reading, and how
 * many games it touched — for reviewing translation quality:
 *
 *   bun run command:log              # newest 200 entries, one line each
 *   bun run command:log --limit 0    # everything
 *   bun run command:log --json       # decoded entries as a JSON array
 *   bun run command:log --clear      # delete all entries
 *
 * COMMAND_LOG_DATABASE_URL overrides the database (defaults to the same
 * built-in database multiplayer uses; see adapters/firebase-match-room).
 */

const DEFAULT_DATABASE_URL =
  'https://centurion-chess-default-rtdb.firebaseio.com'

const DEFAULT_LIMIT = 200

interface CliOptions {
  readonly json: boolean
  readonly clear: boolean
  readonly limit: number
}

function parseArgs(args: readonly string[]): CliOptions {
  let json = false
  let clear = false
  let limit = DEFAULT_LIMIT
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    switch (arg) {
      case '--json':
        json = true
        break
      case '--clear':
        clear = true
        break
      case '--limit': {
        const value = Number(args[index + 1])
        if (!Number.isInteger(value) || value < 0) {
          console.error('--limit expects a non-negative integer.')
          process.exit(1)
        }
        limit = value
        index += 1
        break
      }
      default:
        console.error(`Unknown argument: ${arg}`)
        console.error(
          'Usage: bun run command:log [--json] [--limit N] [--clear]',
        )
        process.exit(1)
    }
  }
  return { json, clear, limit }
}

const options = parseArgs(process.argv.slice(2))
const { COMMAND_LOG_DATABASE_URL } = process.env
const endpoint = commandLogEndpoint(
  COMMAND_LOG_DATABASE_URL ?? DEFAULT_DATABASE_URL,
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
    throw new Error('The log node holds something other than entries.')
  }
  return body as Record<string, unknown>
}

let raw: Record<string, unknown>
try {
  raw = await fetchLog()
} catch (error) {
  console.error(
    `Could not read the command log: ${
      error instanceof Error ? error.message : String(error)
    }`,
  )
  process.exit(1)
}

// Push keys sort chronologically, so key order is write order.
const keys = Object.keys(raw).sort()
const entries: CommandLogEntry[] = []
let undecodable = 0
for (const key of keys) {
  const entry = decodeCommandLogEntry(raw[key])
  if (entry === null) {
    undecodable += 1
    continue
  }
  entries.push(entry)
}

if (options.clear) {
  const response = await fetch(endpoint, { method: 'DELETE' })
  if (!response.ok) {
    console.error(`DELETE ${endpoint} responded ${response.status}`)
    process.exit(1)
  }
  console.log(
    `Cleared ${keys.length} log entr${keys.length === 1 ? 'y' : 'ies'}.`,
  )
  process.exit(0)
}

const shown =
  options.limit === 0 ? entries : entries.slice(entries.length - options.limit)

if (options.json) {
  console.log(JSON.stringify(shown, null, 2))
  process.exit(0)
}

if (entries.length === 0) {
  console.log(
    undecodable === 0
      ? 'No commands logged yet.'
      : `No readable entries (${undecodable} undecodable).`,
  )
  process.exit(0)
}

for (const entry of shown) {
  console.log(formatCommandLogEntry(entry))
}
function countNoun(count: number): string {
  return count === 1 ? 'entry' : 'entries'
}

const hidden = entries.length - shown.length
const notes: string[] = []
if (hidden > 0) {
  notes.push(
    `${hidden} older ${countNoun(hidden)} not shown (--limit 0 for all)`,
  )
}
if (undecodable > 0) {
  notes.push(`${undecodable} undecodable ${countNoun(undecodable)} skipped`)
}
if (notes.length > 0) {
  console.log(`\n${notes.join('; ')}.`)
}
