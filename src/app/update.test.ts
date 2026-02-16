import { describe, expect, it } from 'vitest'
import type { AppState } from './model'
import { updateApp } from './update'

describe('updateApp', () => {
  it('enters superposition lab from menu', () => {
    const [state, commands] = updateApp(
      { tag: 'menu' },
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
    const [state, commands] = updateApp(chatState, { tag: 'back-to-menu' })
    expect(state.tag).toBe('menu')
    expect(commands).toEqual([
      { tag: 'chat-lab', cmd: { tag: 'transport-disconnect' } },
    ])
  })

  it('issues mount command when entering centurion match', () => {
    const [state, commands] = updateApp(
      { tag: 'menu' },
      { tag: 'open-centurion-match' },
    )
    expect(state.tag).toBe('centurion-match')
    expect(commands).toEqual([
      { tag: 'centurion-match', cmd: { tag: 'mount' } },
    ])
  })

  it('ignores chat messages outside chat lab state', () => {
    const [state, commands] = updateApp(
      { tag: 'menu' },
      {
        tag: 'chat-lab-msg',
        msg: { tag: 'create-room-requested' },
      },
    )
    expect(state.tag).toBe('menu')
    expect(commands).toEqual([])
  })
})
