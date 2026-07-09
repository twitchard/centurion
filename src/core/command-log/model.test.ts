import { describe, expect, it } from 'vitest'
import type { CommandPredicate } from '../command/model'
import { STANDARD_WHITE_TO_MOVE_FEN, initMatch } from '../match/model'
import {
  type NewCommandLogEntry,
  commandLogEndpoint,
  commandLogMatchContext,
  commandLogOutcomeFromCompile,
  decodeCommandLogEntry,
  encodeNewCommandLogEntry,
  formatCommandLogEntry,
} from './model'

const KNIGHT: CommandPredicate = { tag: 'piece', roles: ['knight'] }

const COMPILED_ENTRY: NewCommandLogEntry = {
  text: 'develop a knight',
  source: 'solo',
  outcome: commandLogOutcomeFromCompile({ tag: 'compiled', predicate: KNIGHT }),
  match: { turn: 3, matches: { matchedGames: 87, activeGames: 100 } },
  build: 'test-build',
}

const FAILED_ENTRY: NewCommandLogEntry = {
  text: 'do something weird',
  source: 'remote',
  outcome: commandLogOutcomeFromCompile({
    tag: 'failed',
    message: 'Could not interpret the command.',
  }),
  match: { turn: 5, matches: null },
  build: 'test-build',
}

const LAB_ENTRY: NewCommandLogEntry = {
  text: 'all knights advance',
  source: 'lab',
  outcome: commandLogOutcomeFromCompile({ tag: 'compiled', predicate: KNIGHT }),
  match: null,
  build: 'test-build',
}

/** What an encoded entry looks like once Firebase has resolved `at`. */
function storedForm(entry: NewCommandLogEntry, at: number): unknown {
  return { ...encodeNewCommandLogEntry(entry), at }
}

describe('commandLogEndpoint', () => {
  it('appends the log path to the database URL', () => {
    expect(commandLogEndpoint('https://db.example.com')).toBe(
      'https://db.example.com/__trystero__/centurion-command-log.json',
    )
  })

  it('tolerates a trailing slash', () => {
    expect(commandLogEndpoint('https://db.example.com/')).toBe(
      'https://db.example.com/__trystero__/centurion-command-log.json',
    )
  })
})

describe('command log entry codec', () => {
  it('writes the server-timestamp sentinel for at', () => {
    const encoded = encodeNewCommandLogEntry(COMPILED_ENTRY)
    expect(encoded).toMatchObject({ at: { '.sv': 'timestamp' } })
  })

  it('round-trips a compiled match entry', () => {
    const decoded = decodeCommandLogEntry(storedForm(COMPILED_ENTRY, 1234))
    expect(decoded).toEqual({ ...COMPILED_ENTRY, at: 1234 })
  })

  it('round-trips a failed compile', () => {
    const decoded = decodeCommandLogEntry(storedForm(FAILED_ENTRY, 5678))
    expect(decoded).toEqual({ ...FAILED_ENTRY, at: 5678 })
  })

  it('round-trips a lab entry without match context', () => {
    const decoded = decodeCommandLogEntry(storedForm(LAB_ENTRY, 42))
    expect(decoded).toEqual({ ...LAB_ENTRY, at: 42 })
  })

  it('rejects non-records and missing fields', () => {
    expect(decodeCommandLogEntry(null)).toBeNull()
    expect(decodeCommandLogEntry('entry')).toBeNull()
    expect(decodeCommandLogEntry([])).toBeNull()
    expect(decodeCommandLogEntry({})).toBeNull()
    const stored = storedForm(COMPILED_ENTRY, 1) as Record<string, unknown>
    expect(decodeCommandLogEntry({ ...stored, text: 7 })).toBeNull()
    expect(decodeCommandLogEntry({ ...stored, source: 'cli' })).toBeNull()
    expect(decodeCommandLogEntry({ ...stored, at: 'yesterday' })).toBeNull()
    expect(decodeCommandLogEntry({ ...stored, status: 'pending' })).toBeNull()
  })

  it('rejects entries whose predicate does not validate', () => {
    const stored = storedForm(COMPILED_ENTRY, 1) as Record<string, unknown>
    expect(
      decodeCommandLogEntry({ ...stored, predicate: { tag: 'evil' } }),
    ).toBeNull()
  })

  it('drops malformed match context instead of the whole entry', () => {
    const stored = storedForm(COMPILED_ENTRY, 1) as Record<string, unknown>
    const decoded = decodeCommandLogEntry({ ...stored, turn: 'three' })
    expect(decoded).not.toBeNull()
    expect(decoded?.match).toBeNull()
  })
})

describe('commandLogMatchContext', () => {
  it('counts active games where the predicate allows a move', () => {
    const match = initMatch(1, { fens: [STANDARD_WHITE_TO_MOVE_FEN] })
    expect(commandLogMatchContext(match, KNIGHT)).toEqual({
      turn: 1,
      matches: { matchedGames: 1, activeGames: 1 },
    })
    // Nobody can castle from the starting position.
    expect(commandLogMatchContext(match, { tag: 'castles' })).toEqual({
      turn: 1,
      matches: { matchedGames: 0, activeGames: 1 },
    })
  })

  it('records only the turn when there is no predicate', () => {
    const match = initMatch(1, { fens: [STANDARD_WHITE_TO_MOVE_FEN] })
    expect(commandLogMatchContext(match, null)).toEqual({
      turn: 1,
      matches: null,
    })
  })
})

describe('formatCommandLogEntry', () => {
  it('renders a compiled entry with reading and match counts', () => {
    const line = formatCommandLogEntry({ ...COMPILED_ENTRY, at: 0 })
    expect(line).toContain('"develop a knight"')
    expect(line).toContain('[solo turn 3]')
    expect(line).toContain('(87/100 games)')
    expect(line).toContain('a move by a knight')
  })

  it('renders a failed entry with its message', () => {
    const line = formatCommandLogEntry({ ...FAILED_ENTRY, at: 0 })
    expect(line).toContain('FAILED: Could not interpret the command.')
    expect(line).toContain('[remote turn 5]')
  })

  it('renders a lab entry without turn or counts', () => {
    const line = formatCommandLogEntry({ ...LAB_ENTRY, at: 0 })
    expect(line).toContain('[lab]')
    expect(line).not.toContain('games)')
  })
})
