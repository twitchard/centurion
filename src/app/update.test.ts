import { describe, expect, it } from 'vitest'
import type { AppState } from './model'
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

  it('issues disconnect command when leaving chat lab', () => {
    const chatState: AppState = {
      tag: 'chat-lab',
      model: {
        connection: { tag: 'disconnected' },
        joinCodeInput: '',
        draft: '',
        transcript: [],
        nextLineId: 0,
      },
    }
    const [state, commands] = updateApp(chatState, { tag: 'back-to-labs-menu' })
    expect(state.tag).toBe('labs-menu')
    expect(commands).toEqual([
      { tag: 'chat-lab', cmd: { tag: 'transport-disconnect' } },
    ])
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

  it('issues a transport disconnect when leaving the centurion match', () => {
    const [state, commands] = updateApp(
      {
        tag: 'centurion-match',
        model: { tag: 'lobby', joinCodeInput: '', notice: null },
      },
      { tag: 'navigate', route: 'labs' },
    )
    expect(state.tag).toBe('labs-menu')
    expect(commands).toEqual([
      { tag: 'centurion', cmd: { tag: 'transport-disconnect' } },
    ])
  })

  it('navigates from labs back to the game route', () => {
    const [state] = updateApp(
      { tag: 'labs-menu' },
      { tag: 'navigate', route: 'game' },
    )
    expect(state.tag).toBe('centurion-match')
  })

  it('ignores chat messages outside chat lab state', () => {
    const [state, commands] = updateApp(
      { tag: 'labs-menu' },
      {
        tag: 'chat-lab-msg',
        msg: { tag: 'create-room-requested' },
      },
    )
    expect(state.tag).toBe('labs-menu')
    expect(commands).toEqual([])
  })
})
