import { describe, expect, it } from 'vitest'
import { parseArrowList } from './parse-arrow-list'

describe('parseArrowList', () => {
  it('parses multiple arrows', () => {
    const parsed = parseArrowList('e2->e4; g1->f3')
    expect(parsed.tag).toBe('valid')
    if (parsed.tag !== 'valid') {
      return
    }

    expect(parsed.value.length).toBe(2)
    expect(parsed.value[0]?.from).toEqual({ col: 4, row: 1 })
    expect(parsed.value[0]?.to).toEqual({ col: 4, row: 3 })
  })

  it('supports empty input as no arrows', () => {
    const parsed = parseArrowList('   ')
    expect(parsed.tag).toBe('valid')
    if (parsed.tag !== 'valid') {
      return
    }
    expect(parsed.value).toEqual([])
  })

  it('returns diagnostics for invalid arrow tokens', () => {
    const parsed = parseArrowList('e9->e4')
    expect(parsed.tag).toBe('invalid')
    if (parsed.tag !== 'invalid') {
      return
    }
    expect(parsed.diagnostics.length).toBe(1)
  })
})
