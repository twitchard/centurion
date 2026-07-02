import { describe, expect, it } from 'vitest'
import { updateApp } from './update'

describe('updateApp', () => {
  it('enters superposition lab from labs-menu', () => {
    const [state, commands] = updateApp(
      { tag: 'labs-menu' },
      { tag: 'open-superposition-lab' },
    )
    expect(state.tag).toBe('superposition-lab')
    expect(commands).toEqual([])
  })

  it('enters the centurion lobby without side effects', () => {
    const [state, commands] = updateApp(
      { tag: 'labs-menu' },
      { tag: 'open-centurion-match' },
    )
    if (state.tag !== 'centurion-match') {
      throw new Error('expected centurion-match state')
    }
    expect(state.model).toEqual({
      tag: 'lobby',
      joinCodeInput: '',
      notice: null,
    })
    expect(commands).toEqual([])
  })

  it('leaves the match room when leaving the centurion match', () => {
    const [state, commands] = updateApp(
      {
        tag: 'centurion-match',
        model: { tag: 'lobby', joinCodeInput: '', notice: null },
      },
      { tag: 'navigate', route: 'labs' },
    )
    expect(state.tag).toBe('labs-menu')
    expect(commands).toEqual([{ tag: 'centurion', cmd: { tag: 'room-leave' } }])
  })

  it('navigates from labs back to the game route', () => {
    const [state] = updateApp(
      { tag: 'labs-menu' },
      { tag: 'navigate', route: 'game' },
    )
    expect(state.tag).toBe('centurion-match')
  })

  it('ignores centurion messages outside the centurion match state', () => {
    const [state, commands] = updateApp(
      { tag: 'labs-menu' },
      {
        tag: 'centurion-msg',
        msg: { tag: 'join-match-requested' },
      },
    )
    expect(state.tag).toBe('labs-menu')
    expect(commands).toEqual([])
  })
})
