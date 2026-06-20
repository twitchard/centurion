import { describe, expect, it } from 'vitest'
import {
  appendConnectionLog,
  clearConnectionLog,
  connectionLogEntries,
  connectionLogText,
} from './connection-log'

describe('connectionLog', () => {
  it('stores timestamped entries and clears them', () => {
    clearConnectionLog()
    appendConnectionLog('hello')
    expect(connectionLogEntries()).toHaveLength(1)
    expect(connectionLogEntries()[0]).toMatch(/hello$/)
    clearConnectionLog()
    expect(connectionLogEntries()).toEqual([])
  })

  it('joins entries into newline-separated clipboard text', () => {
    clearConnectionLog()
    expect(connectionLogText()).toBe('')
    appendConnectionLog('first')
    appendConnectionLog('second')
    const lines = connectionLogText().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/first$/)
    expect(lines[1]).toMatch(/second$/)
    clearConnectionLog()
  })
})
