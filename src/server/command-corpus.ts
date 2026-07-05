import { describeCommandPredicate } from '../core/command/describe'
import type { CommandPredicate } from '../core/command/model'
import type { CompileOutcome } from './compile-command'

/** One compile attempt, shaped for corpus export and prompt tuning. */
export interface CommandCorpusEntry {
  readonly recordedAt: string
  readonly command: string
  readonly outcome: 'compiled' | 'rejected' | 'failed'
  /** Where the outcome came from: input validation, literal parser, or LLM. */
  readonly source: 'validation' | 'literal' | 'llm'
  readonly predicate?: CommandPredicate | undefined
  readonly readsAs?: string | undefined
  readonly diagnostics?: readonly string[] | undefined
  readonly message?: string | undefined
  readonly status?: number | undefined
  readonly model?: string | undefined
}

export type CommandCorpusSink = (
  entry: CommandCorpusEntry,
) => void | Promise<void>

export const noopCommandCorpusSink: CommandCorpusSink = () => {}

const CORPUS_LOG_PREFIX = 'command-corpus:'

export function buildCommandCorpusEntry(
  command: string,
  source: CommandCorpusEntry['source'],
  outcome: CompileOutcome,
  model?: string | undefined,
): CommandCorpusEntry {
  const base = {
    recordedAt: new Date().toISOString(),
    command,
    source,
    ...(model === undefined ? {} : { model }),
  } satisfies Pick<
    CommandCorpusEntry,
    'recordedAt' | 'command' | 'source' | 'model'
  >

  switch (outcome.tag) {
    case 'compiled':
      return {
        ...base,
        outcome: 'compiled',
        predicate: outcome.predicate,
        readsAs: describeCommandPredicate(outcome.predicate),
      }
    case 'rejected':
      return {
        ...base,
        outcome: 'rejected',
        status: outcome.status,
        diagnostics: outcome.diagnostics,
      }
    case 'failed':
      return {
        ...base,
        outcome: 'failed',
        status: outcome.status,
        message: outcome.message,
      }
  }
}

export async function recordCommandCorpusEntry(
  sink: CommandCorpusSink | undefined,
  entry: CommandCorpusEntry,
): Promise<void> {
  if (sink === undefined) {
    return
  }
  await sink(entry)
}

/** Structured stdout line — works on Vercel Edge and local Bun. */
export function consoleCommandCorpusSink(): CommandCorpusSink {
  return (entry) => {
    console.log(`${CORPUS_LOG_PREFIX}${JSON.stringify(entry)}`)
  }
}

/** Append JSONL locally while developing the compile server. */
export function fileCommandCorpusSink(path: string): CommandCorpusSink {
  return async (entry) => {
    const { appendFile, mkdir } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    await mkdir(dirname(path), { recursive: true })
    await appendFile(path, `${JSON.stringify(entry)}\n`, 'utf8')
  }
}

const DEFAULT_FIREBASE_DATABASE_URL =
  'https://centurion-chess-default-rtdb.firebaseio.com'

/**
 * Push each entry under `__trystero__/command-corpus` in the shared
 * Realtime Database (same writable subtree as multiplayer rooms).
 */
export function firebaseCommandCorpusSink(
  databaseUrl: string = DEFAULT_FIREBASE_DATABASE_URL,
): CommandCorpusSink {
  const base = databaseUrl.replace(/\/$/, '')
  const url = `${base}/__trystero__/command-corpus.json`
  return async (entry) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(entry),
      })
      if (!response.ok) {
        console.warn(
          `${CORPUS_LOG_PREFIX} Firebase push failed (${response.status}).`,
        )
      }
    } catch (error) {
      console.warn(
        `${CORPUS_LOG_PREFIX} Firebase push error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
}

export function compositeCommandCorpusSink(
  ...sinks: readonly CommandCorpusSink[]
): CommandCorpusSink {
  return async (entry) => {
    await Promise.all(sinks.map((sink) => sink(entry)))
  }
}

export interface CommandCorpusEnv {
  readonly COMMAND_CORPUS?: string | undefined
  readonly COMMAND_CORPUS_PATH?: string | undefined
  readonly COMMAND_CORPUS_FIREBASE_URL?: string | undefined
}

/**
 * Resolve sinks from environment:
 * - `COMMAND_CORPUS=off` disables logging
 * - `COMMAND_CORPUS_PATH` appends JSONL (Bun dev server default)
 * - `COMMAND_CORPUS_FIREBASE_URL` pushes to RTDB (Vercel default)
 */
export function commandCorpusSinkFromEnv(
  env: CommandCorpusEnv,
  defaults?: {
    readonly filePath?: string | undefined
    readonly firebase?: boolean | undefined
  },
): CommandCorpusSink {
  if (env.COMMAND_CORPUS?.trim().toLowerCase() === 'off') {
    return noopCommandCorpusSink
  }

  const sinks: CommandCorpusSink[] = [consoleCommandCorpusSink()]

  const filePath = env.COMMAND_CORPUS_PATH?.trim() || defaults?.filePath?.trim()
  if (filePath !== undefined && filePath.length > 0) {
    sinks.push(fileCommandCorpusSink(filePath))
  }

  const firebaseUrl = env.COMMAND_CORPUS_FIREBASE_URL?.trim()
  if (firebaseUrl !== undefined && firebaseUrl.length > 0) {
    sinks.push(firebaseCommandCorpusSink(firebaseUrl))
  } else if (defaults?.firebase === true) {
    sinks.push(firebaseCommandCorpusSink())
  }

  return compositeCommandCorpusSink(...sinks)
}
