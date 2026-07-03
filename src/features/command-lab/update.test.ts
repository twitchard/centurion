import { describe, expect, it } from 'vitest'
import type { CommandPredicate } from '../../core/command/model'
import { commandLabMatches, initCommandLabModel } from './model'
import { updateCommandLab } from './update'

const KNIGHTS_ADVANCE: CommandPredicate = {
  tag: 'and',
  all: [{ tag: 'piece', roles: ['knight'] }, { tag: 'advances' }],
}

describe('updateCommandLab', () => {
  it('emits a compile command with the trimmed input', () => {
    let model = initCommandLabModel()
    ;[model] = updateCommandLab(model, {
      tag: 'command-input-updated',
      value: '  push the pawns  ',
    })
    const [next, commands] = updateCommandLab(model, {
      tag: 'compile-requested',
    })
    expect(next.compile).toEqual({
      tag: 'compiling',
      command: 'push the pawns',
    })
    expect(commands).toEqual([
      {
        tag: 'compile-command',
        endpoint: model.endpointInput,
        command: 'push the pawns',
      },
    ])
  })

  it('rejects over-limit commands locally', () => {
    let model = initCommandLabModel()
    ;[model] = updateCommandLab(model, {
      tag: 'command-input-updated',
      value: 'word '.repeat(21),
    })
    const [next, commands] = updateCommandLab(model, {
      tag: 'compile-requested',
    })
    expect(commands).toEqual([])
    expect(next.compile.tag).toBe('failed')
  })

  it('applies a compile result and derives matches per position', () => {
    const model = initCommandLabModel()
    const [compiling] = updateCommandLab(model, { tag: 'compile-requested' })
    const [next] = updateCommandLab(compiling, {
      tag: 'compile-finished',
      command: 'all knights advance',
      result: { tag: 'compiled', predicate: KNIGHTS_ADVANCE },
    })
    expect(next.compile.tag).toBe('compiled')
    const matches = commandLabMatches(next)
    expect(matches).toHaveLength(3)
    expect(matches[0]?.sans).toEqual(['Na3', 'Nc3', 'Nf3', 'Nh3'])
  })

  it('ignores stale compile results', () => {
    const model = initCommandLabModel()
    const [next] = updateCommandLab(model, {
      tag: 'compile-finished',
      command: 'something else',
      result: { tag: 'failed', message: 'late' },
    })
    expect(next.compile.tag).toBe('idle')
  })
})
