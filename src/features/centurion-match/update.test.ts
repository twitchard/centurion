import { parseSquare } from 'chessops/util'
import { describe, expect, it } from 'vitest'
import { activePlacer, otherPlayer } from '../../core/match/model'
import { type CenturionModel, initCenturionModel } from './model'
import { type CenturionMsg, updateCenturion } from './update'

function sq(name: string): number {
  const square = parseSquare(name)
  if (square === undefined) {
    throw new Error(`Bad square: ${name}`)
  }
  return square
}

function apply(
  model: CenturionModel,
  ...msgs: CenturionMsg[]
): ReturnType<typeof updateCenturion> {
  let current = model
  let lastCommands: ReturnType<typeof updateCenturion>[1] = []
  for (const msg of msgs) {
    const [next, commands] = updateCenturion(current, msg)
    current = next
    lastCommands = commands
  }
  return [current, lastCommands]
}

describe('pass and play', () => {
  it('starts a local 100-game match', () => {
    const [model, commands] = apply(initCenturionModel(), {
      tag: 'pass-and-play-requested',
      seed: 11,
    })
    expect(commands).toEqual([])
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(model.session.mode).toEqual({ tag: 'local' })
    expect(model.session.match.games).toHaveLength(100)
  })

  it('places an arrow via two board clicks and resolves the turn', () => {
    const [model] = apply(
      initCenturionModel(),
      { tag: 'pass-and-play-requested', seed: 11 },
      { tag: 'board-square-clicked', square: sq('e2') },
      { tag: 'board-square-clicked', square: sq('e4') },
    )
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(model.session.match.turn).toBe(2)
    expect(model.session.match.arrows).toHaveLength(1)
    expect(model.session.selectedSquare).toBeNull()
  })

  it('toggles square selection off when re-clicked', () => {
    const [model] = apply(
      initCenturionModel(),
      { tag: 'pass-and-play-requested', seed: 11 },
      { tag: 'board-square-clicked', square: sq('e2') },
      { tag: 'board-square-clicked', square: sq('e2') },
    )
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(model.session.selectedSquare).toBeNull()
    expect(model.session.match.turn).toBe(1)
  })

  it('places an arrow from text notation', () => {
    const [model] = apply(
      initCenturionModel(),
      { tag: 'pass-and-play-requested', seed: 11 },
      { tag: 'arrow-input-updated', value: 'e2->e4' },
      { tag: 'arrow-submit-requested' },
    )
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(model.session.match.turn).toBe(2)
    expect(model.session.arrowInput).toBe('')
  })

  it('rejects malformed arrow notation with a diagnostic', () => {
    const [model] = apply(
      initCenturionModel(),
      { tag: 'pass-and-play-requested', seed: 11 },
      { tag: 'arrow-input-updated', value: 'nonsense' },
      { tag: 'arrow-submit-requested' },
    )
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(model.session.match.turn).toBe(1)
    expect(model.session.inputError).not.toBeNull()
  })
})

describe('multiplayer flow', () => {
  function hostToPlaying(): ReturnType<typeof updateCenturion> {
    return apply(
      initCenturionModel(),
      { tag: 'new-match-requested' },
      {
        tag: 'transport-status-changed',
        status: 'waiting',
        code: '123456',
        isHost: true,
      },
      { tag: 'transport-peer-joined', seed: 77 },
    )
  }

  it('host starts the match and broadcasts the seed when a peer joins', () => {
    const [model, commands] = hostToPlaying()
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(model.session.mode).toEqual({
      tag: 'remote',
      you: 1,
      code: '123456',
      peerConnected: true,
    })
    expect(commands).toEqual([
      {
        tag: 'transport-send',
        payload: { type: 'centurion:start', seed: 77, gameCount: 100 },
      },
    ])
  })

  it('guest initialises the identical match from the start message', () => {
    const [guest] = apply(
      initCenturionModel(),
      { tag: 'join-code-updated', value: '123456' },
      { tag: 'join-match-requested' },
      {
        tag: 'transport-status-changed',
        status: 'connected',
        code: '123456',
        isHost: false,
      },
      {
        tag: 'transport-message-received',
        payload: { type: 'centurion:start', seed: 77, gameCount: 100 },
      },
    )
    const [host] = hostToPlaying()
    if (guest.tag !== 'playing' || host.tag !== 'playing') {
      throw new Error('expected playing states')
    }
    expect(guest.session.mode).toEqual({
      tag: 'remote',
      you: 2,
      code: '123456',
      peerConnected: true,
    })
    expect(guest.session.match.firstPlacer).toBe(host.session.match.firstPlacer)
    expect(guest.session.match.rng).toBe(host.session.match.rng)
  })

  it('keeps both peers in lockstep across an exchanged arrow', () => {
    const [host] = hostToPlaying()
    const [guest] = apply(
      initCenturionModel(),
      { tag: 'join-code-updated', value: '123456' },
      { tag: 'join-match-requested' },
      {
        tag: 'transport-status-changed',
        status: 'connected',
        code: '123456',
        isHost: false,
      },
      {
        tag: 'transport-message-received',
        payload: { type: 'centurion:start', seed: 77, gameCount: 100 },
      },
    )
    if (host.tag !== 'playing' || guest.tag !== 'playing') {
      throw new Error('expected playing states')
    }

    const placer = activePlacer(host.session.match)
    const [mover, receiver] = placer === 1 ? [host, guest] : [guest, host]

    // The mover clicks in their own visual frame; player 2's view is
    // rank-flipped, so both pick the square they see as e2/e4.
    const [movedModel, commands] = apply(
      mover,
      { tag: 'board-square-clicked', square: sq('e2') },
      { tag: 'board-square-clicked', square: sq('e4') },
    )
    expect(commands).toHaveLength(1)
    const sent = commands[0]
    if (sent?.tag !== 'transport-send') {
      throw new Error('expected a transport-send command')
    }

    const [receivedModel] = apply(receiver, {
      tag: 'transport-message-received',
      payload: sent.payload,
    })
    if (movedModel.tag !== 'playing' || receivedModel.tag !== 'playing') {
      throw new Error('expected playing states')
    }
    expect(receivedModel.session.match.turn).toBe(2)
    expect(receivedModel.session.match.rng).toBe(movedModel.session.match.rng)
    expect(receivedModel.session.match.arrows).toEqual(
      movedModel.session.match.arrows,
    )
  })

  it('rejects arrow placement when it is not your turn', () => {
    const [host] = hostToPlaying()
    if (host.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    const notYourTurn = activePlacer(host.session.match) === otherPlayer(1)
    const [model, commands] = apply(host, {
      tag: 'board-square-clicked',
      square: sq('e2'),
    })
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    if (notYourTurn) {
      expect(model.session.inputError).not.toBeNull()
      expect(model.session.selectedSquare).toBeNull()
    } else {
      expect(model.session.selectedSquare).toBe(sq('e2'))
    }
    expect(commands).toEqual([])
  })

  it('flags out-of-sync arrows instead of applying them', () => {
    const [host] = hostToPlaying()
    if (host.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    const [model] = apply(host, {
      tag: 'transport-message-received',
      payload: { type: 'centurion:arrow', from: 12, to: 28, turn: 99 },
    })
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(model.session.match.turn).toBe(host.session.match.turn)
    expect(model.session.notice).not.toBeNull()
  })

  it('returns to the lobby and disconnects on leave', () => {
    const [host] = hostToPlaying()
    const [model, commands] = apply(host, { tag: 'leave-session-requested' })
    expect(model).toEqual(initCenturionModel())
    expect(commands).toEqual([{ tag: 'transport-disconnect' }])
  })
})
