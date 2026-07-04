import { describe, expect, it } from 'vitest'
import { COMMAND_CHAR_LIMIT, validateCommandText } from './text'

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

  it('rejects commands over the character limit', () => {
    const long = 'x'.repeat(COMMAND_CHAR_LIMIT + 1)
    const result = validateCommandText(long)
    expect(result.tag).toBe('invalid')
    if (result.tag === 'invalid') {
      expect(result.diagnostics[0]).toContain(
        `${COMMAND_CHAR_LIMIT + 1} characters`,
      )
    }
  })
})
