import { describe, expect, it } from 'vitest'
import { COMMAND_WORD_LIMIT, validateCommandText } from './text'

describe('validateCommandText', () => {
  it('trims and accepts a short command', () => {
    expect(validateCommandText('  all knights advance  ')).toEqual({
      tag: 'valid',
      value: 'all knights advance',
    })
  })

  it('rejects empty commands', () => {
    expect(validateCommandText('   ').tag).toBe('invalid')
  })

  it('rejects commands over the word limit', () => {
    const long = Array.from({ length: COMMAND_WORD_LIMIT + 1 }, () => 'x').join(
      ' ',
    )
    const result = validateCommandText(long)
    expect(result.tag).toBe('invalid')
    if (result.tag === 'invalid') {
      expect(result.diagnostics[0]).toContain(`${COMMAND_WORD_LIMIT + 1} words`)
    }
  })
})
