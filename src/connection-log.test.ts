import { describe, expect, it } from 'vitest'
import {
  appendConnectionLog,
  clearConnectionLog,
  connectionLogEntries,
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
})
