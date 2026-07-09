import { decodeCommandPredicate } from '../command/decode'
import { describeCommandPredicate } from '../command/describe'
import { matchingMoves } from '../command/evaluate'
import type { CommandPredicate } from '../command/model'
import type { MatchState } from '../match/model'

/**
 * The command log: every natural-language command sent to the compiler
 * (from a match or the command lab, success or failure) is appended to
 * the shared Realtime Database so translation quality can be reviewed
 * later against what players actually typed. Literal notation never
 * reaches the compiler, so it never appears here.
 *
 * Entries live under the `__trystero__` subtree because that is the
 * only path the deployed database rules leave writable (see
 * adapters/firebase-match-room). Like the match rooms, the log is
 * world-readable and world-writable, so everything read back is
 * untrusted and passes through `decodeCommandLogEntry`.
 */
export const COMMAND_LOG_PATH = '__trystero__/centurion-command-log'

/** Firebase REST endpoint for the log node (POST appends, GET reads). */
export function commandLogEndpoint(databaseUrl: string): string {
  return `${databaseUrl.replace(/\/+$/, '')}/${COMMAND_LOG_PATH}.json`
}

export const COMMAND_LOG_SOURCES = [
  'solo',
  'local',
  'remote',
  'match',
  'lab',
] as const

/**
 * Where the command was typed: a match mode, 'lab' for the Command
 * Compiler Lab, or 'match' when the session ended before the compile
 * response arrived and the mode is no longer known.
 */
export type CommandLogSource = (typeof COMMAND_LOG_SOURCES)[number]

export type CommandLogOutcome =
  | {
      readonly tag: 'compiled'
      readonly predicate: CommandPredicate
      /** The deterministic English rendering shown to the player. */
      readonly reading: string
    }
  | { readonly tag: 'failed'; readonly message: string }

export interface CommandLogMatchContext {
  readonly turn: number
  /** Null when the compile failed: there is no predicate to evaluate. */
  readonly matches: {
    /** Active games in which the predicate allows at least one legal move. */
    readonly matchedGames: number
    readonly activeGames: number
  } | null
}

export interface NewCommandLogEntry {
  readonly text: string
  readonly source: CommandLogSource
  readonly outcome: CommandLogOutcome
  /** Null for lab compiles and for compiles that outlived their session. */
  readonly match: CommandLogMatchContext | null
  readonly build: string
}

export interface CommandLogEntry extends NewCommandLogEntry {
  /** Server-assigned write time, epoch milliseconds. */
  readonly at: number
}

export function commandLogOutcomeFromCompile(
  result:
    | { readonly tag: 'compiled'; readonly predicate: CommandPredicate }
    | { readonly tag: 'failed'; readonly message: string },
): CommandLogOutcome {
  return result.tag === 'compiled'
    ? {
        tag: 'compiled',
        predicate: result.predicate,
        reading: describeCommandPredicate(result.predicate),
      }
    : { tag: 'failed', message: result.message }
}

/**
 * How the compiled predicate lands on the current match: in how many
 * active games it allows at least one legal move. Pass a null predicate
 * (failed compile) to record only the turn.
 */
export function commandLogMatchContext(
  match: MatchState,
  predicate: CommandPredicate | null,
): CommandLogMatchContext {
  if (predicate === null) {
    return { turn: match.turn, matches: null }
  }
  let matchedGames = 0
  let activeGames = 0
  for (const game of match.games) {
    if (game.status.tag !== 'active') {
      continue
    }
    activeGames += 1
    if (matchingMoves(game.position, predicate).length > 0) {
      matchedGames += 1
    }
  }
  return { turn: match.turn, matches: { matchedGames, activeGames } }
}

/**
 * Wire format for one entry: a flat JSON record. `at` is written as the
 * Firebase server-timestamp sentinel so ordering does not depend on
 * player clocks; it reads back as epoch milliseconds.
 */
export function encodeNewCommandLogEntry(
  entry: NewCommandLogEntry,
): Record<string, unknown> {
  const outcome =
    entry.outcome.tag === 'compiled'
      ? {
          status: 'compiled',
          predicate: entry.outcome.predicate,
          reading: entry.outcome.reading,
        }
      : { status: 'failed', error: entry.outcome.message }
  const context =
    entry.match === null
      ? {}
      : { turn: entry.match.turn, ...(entry.match.matches ?? {}) }
  return {
    text: entry.text,
    source: entry.source,
    build: entry.build,
    at: { '.sv': 'timestamp' },
    ...outcome,
    ...context,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSource(value: unknown): value is CommandLogSource {
  return (
    typeof value === 'string' &&
    (COMMAND_LOG_SOURCES as readonly string[]).includes(value)
  )
}

function decodeOutcome(
  record: Record<string, unknown>,
): CommandLogOutcome | null {
  const fields = record as {
    status?: unknown
    error?: unknown
    predicate?: unknown
    reading?: unknown
  }
  if (fields.status === 'failed') {
    const message = fields.error
    return typeof message === 'string' ? { tag: 'failed', message } : null
  }
  if (fields.status !== 'compiled') {
    return null
  }
  const predicate = decodeCommandPredicate(fields.predicate)
  const reading = fields.reading
  if (predicate.tag !== 'valid' || typeof reading !== 'string') {
    return null
  }
  return { tag: 'compiled', predicate: predicate.value, reading }
}

function decodeMatchContext(
  record: Record<string, unknown>,
): CommandLogMatchContext | null {
  const fields = record as {
    turn?: unknown
    matchedGames?: unknown
    activeGames?: unknown
  }
  if (typeof fields.turn !== 'number') {
    return null
  }
  const matches =
    typeof fields.matchedGames === 'number' &&
    typeof fields.activeGames === 'number'
      ? { matchedGames: fields.matchedGames, activeGames: fields.activeGames }
      : null
  return { turn: fields.turn, matches }
}

/**
 * Decode one untrusted log record (anyone can write to the log node).
 * Returns null for anything malformed so one junk entry cannot break
 * reading the rest of the log.
 */
export function decodeCommandLogEntry(input: unknown): CommandLogEntry | null {
  if (!isRecord(input)) {
    return null
  }
  const { text, source, build, at } = input as {
    text?: unknown
    source?: unknown
    build?: unknown
    at?: unknown
  }
  if (
    typeof text !== 'string' ||
    !isSource(source) ||
    typeof build !== 'string' ||
    typeof at !== 'number'
  ) {
    return null
  }
  const outcome = decodeOutcome(input)
  if (outcome === null) {
    return null
  }
  return { text, source, outcome, match: decodeMatchContext(input), build, at }
}

/** One human-readable line per entry, for the command:log CLI. */
export function formatCommandLogEntry(entry: CommandLogEntry): string {
  const when = new Date(entry.at).toISOString().slice(0, 16).replace('T', ' ')
  const where =
    entry.match === null
      ? entry.source
      : `${entry.source} turn ${entry.match.turn}`
  if (entry.outcome.tag === 'failed') {
    return `${when} [${where}] "${entry.text}" -> FAILED: ${entry.outcome.message}`
  }
  const games =
    entry.match === null || entry.match.matches === null
      ? ''
      : ` (${entry.match.matches.matchedGames}/${entry.match.matches.activeGames} games)`
  return `${when} [${where}] "${entry.text}" -> ${entry.outcome.reading}${games}`
}
