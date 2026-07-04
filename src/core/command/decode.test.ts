import { describe, expect, it } from 'vitest'
import { decodeCommandPredicate } from './decode'
import type { CommandPredicate } from './model'

describe('decodeCommandPredicate', () => {
  it('roundtrips a compound predicate', () => {
    const predicate: CommandPredicate = {
      tag: 'and',
      all: [
        { tag: 'piece', roles: ['knight', 'bishop'] },
        { tag: 'advances' },
        {
          tag: 'to',
          region: { files: { from: 'e', to: 'h' }, ranks: { from: 3, to: 8 } },
        },
      ],
    }
    const result = decodeCommandPredicate(JSON.parse(JSON.stringify(predicate)))
    expect(result).toEqual({ tag: 'valid', value: predicate })
  })

  it('accepts captures without a role filter', () => {
    expect(decodeCommandPredicate({ tag: 'captures' })).toEqual({
      tag: 'valid',
      value: { tag: 'captures' },
    })
  })

  it('accepts absolute board ranks on regions', () => {
    expect(
      decodeCommandPredicate({
        tag: 'to',
        region: {
          files: { from: 'c', to: 'c' },
          ranks: { from: 5, to: 5 },
          absolute: true,
        },
      }),
    ).toEqual({
      tag: 'valid',
      value: {
        tag: 'to',
        region: {
          files: { from: 'c', to: 'c' },
          ranks: { from: 5, to: 5 },
          absolute: true,
        },
      },
    })
  })

  it('rejects non-true absolute flags', () => {
    expect(
      decodeCommandPredicate({
        tag: 'to',
        region: { ranks: { from: 5, to: 5 }, absolute: false },
      }).tag,
    ).toBe('invalid')
  })

  it('rejects unknown tags with a path', () => {
    const result = decodeCommandPredicate({
      tag: 'and',
      all: [{ tag: 'best-move' }],
    })
    expect(result.tag).toBe('invalid')
    if (result.tag === 'invalid') {
      expect(result.diagnostics[0]).toContain('predicate.all[0]')
      expect(result.diagnostics[0]).toContain('best-move')
    }
  })

  it('rejects empty role lists', () => {
    expect(decodeCommandPredicate({ tag: 'piece', roles: [] }).tag).toBe(
      'invalid',
    )
  })

  it('rejects regions without files or ranks', () => {
    expect(decodeCommandPredicate({ tag: 'from', region: {} }).tag).toBe(
      'invalid',
    )
  })

  it('rejects inverted file ranges', () => {
    expect(
      decodeCommandPredicate({
        tag: 'from',
        region: { files: { from: 'h', to: 'a' } },
      }).tag,
    ).toBe('invalid')
  })

  it('rejects predicates nested past the depth limit', () => {
    let predicate: unknown = { tag: 'advances' }
    for (let i = 0; i < 6; i++) {
      predicate = { tag: 'not', inner: predicate }
    }
    const result = decodeCommandPredicate(predicate)
    expect(result.tag).toBe('invalid')
    if (result.tag === 'invalid') {
      expect(result.diagnostics[0]).toContain('nesting limit')
    }
  })

  it('rejects predicates with too many nodes', () => {
    const eightPieces = Array.from({ length: 8 }, () => ({
      tag: 'piece',
      roles: ['pawn'],
    }))
    const result = decodeCommandPredicate({
      tag: 'and',
      all: [
        { tag: 'or', any: eightPieces },
        { tag: 'or', any: eightPieces },
      ],
    })
    expect(result.tag).toBe('invalid')
    if (result.tag === 'invalid') {
      expect(result.diagnostics[0]).toContain('nodes')
    }
  })

  it('rejects non-object input', () => {
    expect(decodeCommandPredicate('castles').tag).toBe('invalid')
    expect(decodeCommandPredicate(null).tag).toBe('invalid')
  })
})
