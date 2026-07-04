import { describe, expect, it } from 'vitest'
import { describeCommandPredicate } from './describe'

describe('describeCommandPredicate', () => {
  it('renders a compound predicate as one sentence', () => {
    expect(
      describeCommandPredicate({
        tag: 'and',
        all: [
          { tag: 'piece', roles: ['pawn'] },
          { tag: 'advances' },
          { tag: 'from', region: { files: { from: 'e', to: 'h' } } },
        ],
      }),
    ).toBe('a move by a pawn and that advances and starting on files e-h')
  })

  it('renders negation and role lists', () => {
    expect(
      describeCommandPredicate({
        tag: 'not',
        inner: { tag: 'piece', roles: ['queen', 'king'] },
      }),
    ).toBe('a move not (by a queen or king)')
  })

  it('renders absolute single-square regions as algebraic names', () => {
    expect(
      describeCommandPredicate({
        tag: 'to',
        region: {
          files: { from: 'c', to: 'c' },
          ranks: { from: 5, to: 5 },
          absolute: true,
        },
      }),
    ).toBe('a move ending on c5')
  })

  it('renders single-square regions', () => {
    expect(
      describeCommandPredicate({
        tag: 'to',
        region: { files: { from: 'f', to: 'f' }, ranks: { from: 3, to: 3 } },
      }),
    ).toBe('a move ending on the f-file and your rank 3')
  })
})
