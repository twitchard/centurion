import { describe, expect, it } from 'vitest'
import { parseFenList } from './parse-fen-list'

describe('parseFenList', () => {
  it('parses multiple FEN positions from delimiter-separated input', () => {
    const input = [
      '8/8/8/8/8/8/8/8 w - - 0 1',
      '8/8/8/8/8/8/8/4K3 w - - 0 1',
    ].join('\n')

    const parsed = parseFenList(input)
    expect(parsed.tag).toBe('valid')
    if (parsed.tag !== 'valid') {
      return
    }

    expect(parsed.value.length).toBe(2)
    expect(parsed.value[0]?.pieces.length).toBe(0)
    expect(parsed.value[1]?.pieces.length).toBe(1)
  })

  it('returns diagnostics for malformed board rows', () => {
    const parsed = parseFenList('8/8/8/8/8/8/8/9 w - - 0 1')
    expect(parsed.tag).toBe('invalid')
    if (parsed.tag !== 'invalid') {
      return
    }
    expect(parsed.diagnostics.length).toBeGreaterThan(0)
  })
})
