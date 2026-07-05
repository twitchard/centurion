import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommandPredicate } from '../core/command/model'
import {
  buildCommandCorpusEntry,
  commandCorpusSinkFromEnv,
  compositeCommandCorpusSink,
  consoleCommandCorpusSink,
  fileCommandCorpusSink,
  firebaseCommandCorpusSink,
  noopCommandCorpusSink,
  recordCommandCorpusEntry,
} from './command-corpus'

const KNIGHTS_ADVANCE: CommandPredicate = {
  tag: 'and',
  all: [{ tag: 'piece', roles: ['knight'] }, { tag: 'advances' }],
}

describe('buildCommandCorpusEntry', () => {
  it('captures compiled LLM output with reads-as text', () => {
    const entry = buildCommandCorpusEntry(
      'all knights advance',
      'llm',
      { tag: 'compiled', predicate: KNIGHTS_ADVANCE },
      'claude-opus-4-8',
    )
    expect(entry.command).toBe('all knights advance')
    expect(entry.source).toBe('llm')
    expect(entry.outcome).toBe('compiled')
    expect(entry.predicate).toEqual(KNIGHTS_ADVANCE)
    expect(entry.readsAs).toBe('a move by a knight and that advances')
    expect(entry.model).toBe('claude-opus-4-8')
    expect(entry.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('captures rejected validation diagnostics', () => {
    const entry = buildCommandCorpusEntry('x'.repeat(41), 'validation', {
      tag: 'rejected',
      status: 400,
      diagnostics: ['Command is 41 characters; the limit is 40.'],
    })
    expect(entry.outcome).toBe('rejected')
    expect(entry.diagnostics).toEqual([
      'Command is 41 characters; the limit is 40.',
    ])
    expect(entry.status).toBe(400)
    expect(entry.predicate).toBeUndefined()
  })

  it('captures upstream failures', () => {
    const entry = buildCommandCorpusEntry('castle', 'llm', {
      tag: 'failed',
      status: 502,
      message: 'Compile model error (500).',
    })
    expect(entry.outcome).toBe('failed')
    expect(entry.message).toBe('Compile model error (500).')
  })
})

describe('command corpus sinks', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('noop sink does nothing', async () => {
    await expect(
      recordCommandCorpusEntry(noopCommandCorpusSink, {
        recordedAt: '2026-07-05T00:00:00.000Z',
        command: 'e4',
        outcome: 'compiled',
        source: 'literal',
      }),
    ).resolves.toBeUndefined()
  })

  it('console sink prints a prefixed JSON line', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleCommandCorpusSink()({
      recordedAt: '2026-07-05T00:00:00.000Z',
      command: 'e4',
      outcome: 'compiled',
      source: 'literal',
    })
    expect(log).toHaveBeenCalledWith(
      'command-corpus:{"recordedAt":"2026-07-05T00:00:00.000Z","command":"e4","outcome":"compiled","source":"literal"}',
    )
  })

  it('file sink appends JSONL', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'command-corpus-'))
    const path = join(dir, 'corpus.jsonl')
    const sink = fileCommandCorpusSink(path)
    await sink({
      recordedAt: '2026-07-05T00:00:00.000Z',
      command: 'castle',
      outcome: 'compiled',
      source: 'llm',
      predicate: { tag: 'castles' },
      readsAs: 'a move that castles',
    })
    const text = await readFile(path, 'utf8')
    expect(text).toBe(
      `${JSON.stringify({
        recordedAt: '2026-07-05T00:00:00.000Z',
        command: 'castle',
        outcome: 'compiled',
        source: 'llm',
        predicate: { tag: 'castles' },
        readsAs: 'a move that castles',
      })}\n`,
    )
  })

  it('firebase sink posts to the corpus subtree', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await firebaseCommandCorpusSink('https://test.firebaseio.com')({
      recordedAt: '2026-07-05T00:00:00.000Z',
      command: 'take the queen',
      outcome: 'compiled',
      source: 'llm',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://test.firebaseio.com/__trystero__/command-corpus.json',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('composite sink fans out to every sink', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const entry = {
      recordedAt: '2026-07-05T00:00:00.000Z',
      command: 'e4',
      outcome: 'compiled' as const,
      source: 'literal' as const,
    }
    await compositeCommandCorpusSink(first, second)(entry)
    expect(first).toHaveBeenCalledWith(entry)
    expect(second).toHaveBeenCalledWith(entry)
  })

  it('commandCorpusSinkFromEnv respects COMMAND_CORPUS=off', () => {
    expect(
      commandCorpusSinkFromEnv({ COMMAND_CORPUS: 'off' }, { firebase: true }),
    ).toBe(noopCommandCorpusSink)
  })

  it('commandCorpusSinkFromEnv wires file and firebase defaults', () => {
    const sink = commandCorpusSinkFromEnv(
      {},
      { filePath: 'data/command-corpus.jsonl', firebase: true },
    )
    expect(sink).not.toBe(noopCommandCorpusSink)
  })
})
