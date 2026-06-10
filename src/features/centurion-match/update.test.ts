import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import { makeUci, parseSquare, squareRank } from 'chessops/util'
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

/** Stand-in for Stockfish in tests: the first legal move per position. */
function firstLegalUci(fen: string): string {
  const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
  for (const [from, dests] of position.allDests()) {
    for (const to of dests) {
      const isPawn = position.board.getRole(from) === 'pawn'
      const toRank = squareRank(to)
      if (isPawn && (toRank === 0 || toRank === 7)) {
        return makeUci({ from, to, promotion: 'queen' })
      }
      return makeUci({ from, to })
    }
  }
  throw new Error(`No legal move in ${fen}`)
}

/**
 * Run the async half of a turn: take the compute-engine-moves command
 * issued by the reducer, answer it with first-legal moves, and return
 * the follow-up message.
 */
function engineAnswer(
  commands: ReturnType<typeof updateCenturion>[1],
): CenturionMsg {
  const compute = commands.find((cmd) => cmd.tag === 'compute-engine-moves')
  if (compute === undefined || compute.tag !== 'compute-engine-moves') {
    throw new Error('expected a compute-engine-moves command')
  }
  return {
    tag: 'engine-moves-computed',
    moves: compute.fens.map(firstLegalUci),
  }
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
    const [pendingModel, commands] = apply(
      initCenturionModel(),
      { tag: 'pass-and-play-requested', seed: 11 },
      { tag: 'board-square-clicked', square: sq('e2') },
      { tag: 'board-square-clicked', square: sq('e4') },
    )
    if (pendingModel.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    // The arrow phase ran synchronously; Stockfish moves are now pending.
    expect(pendingModel.session.resolving).not.toBeNull()
    expect(pendingModel.session.match.turn).toBe(1)

    const [model] = apply(pendingModel, engineAnswer(commands))
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(model.session.resolving).toBeNull()
    expect(model.session.match.turn).toBe(2)
    expect(model.session.match.arrows).toHaveLength(1)
    expect(model.session.selectedSquare).toBeNull()
  })

  it('ignores board clicks and rejects submits while resolving', () => {
    const [pendingModel] = apply(
      initCenturionModel(),
      { tag: 'pass-and-play-requested', seed: 11 },
      { tag: 'board-square-clicked', square: sq('e2') },
      { tag: 'board-square-clicked', square: sq('e4') },
    )
    if (pendingModel.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    const [clicked, clickCommands] = apply(pendingModel, {
      tag: 'board-square-clicked',
      square: sq('d2'),
    })
    if (clicked.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(clicked.session.selectedSquare).toBeNull()
    expect(clickCommands).toEqual([])
  })

  it('abandons the turn when the engine fails', () => {
    const [pendingModel] = apply(
      initCenturionModel(),
      { tag: 'pass-and-play-requested', seed: 11 },
      { tag: 'board-square-clicked', square: sq('e2') },
      { tag: 'board-square-clicked', square: sq('e4') },
    )
    const [model] = apply(pendingModel, {
      tag: 'engine-moves-failed',
      message: 'worker crashed.',
    })
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(model.session.resolving).toBeNull()
    expect(model.session.match.turn).toBe(1)
    expect(model.session.match.arrows).toHaveLength(0)
    expect(model.session.notice).toContain('worker crashed')
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
    const [pendingModel, commands] = apply(
      initCenturionModel(),
      { tag: 'pass-and-play-requested', seed: 11 },
      { tag: 'arrow-input-updated', value: 'e2->e4' },
      { tag: 'arrow-submit-requested' },
    )
    const [model] = apply(pendingModel, engineAnswer(commands))
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

describe('solo mode', () => {
  it('plays two half-turns per arrow with no opponent arrow', () => {
    const [pendingFirst, firstCommands] = apply(
      initCenturionModel(),
      { tag: 'solo-requested', seed: 21 },
      { tag: 'board-square-clicked', square: sq('e2') },
      { tag: 'board-square-clicked', square: sq('e4') },
    )
    if (pendingFirst.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(pendingFirst.session.mode).toEqual({ tag: 'solo' })

    // First engine answer settles the white ply, then the black ply
    // begins automatically with another engine command.
    const [pendingSecond, secondCommands] = apply(
      pendingFirst,
      engineAnswer(firstCommands),
    )
    if (pendingSecond.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(pendingSecond.session.match.turn).toBe(2)
    expect(pendingSecond.session.resolving).not.toBeNull()

    const [model, finalCommands] = apply(
      pendingSecond,
      engineAnswer(secondCommands),
    )
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(finalCommands).toEqual([])
    expect(model.session.match.turn).toBe(3)
    expect(model.session.resolving).toBeNull()
    // One arrow total, every arrow yours, both plies played everywhere.
    expect(model.session.match.arrows).toHaveLength(1)
    expect(model.session.match.arrows[0]?.owner).toBe(1)
    for (const game of model.session.match.games) {
      expect(game.position.fullmoves).toBe(2)
      expect(game.position.turn).toBe('white')
    }
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
        pendingSeed: 77,
      },
      { tag: 'transport-peer-joined' },
    )
  }

  it('offers share and copy commands while waiting for an opponent', () => {
    const [waiting] = apply(
      initCenturionModel(),
      { tag: 'new-match-requested' },
      {
        tag: 'transport-status-changed',
        status: 'waiting',
        code: '123456',
        isHost: true,
        pendingSeed: 42,
      },
    )
    expect(waiting).toEqual({
      tag: 'waiting',
      code: '123456',
      pendingSeed: 42,
      notice: null,
    })

    const [, shareCommands] = apply(waiting, { tag: 'share-invite-requested' })
    expect(shareCommands).toEqual([{ tag: 'share-invite', code: '123456' }])

    const [, copyCommands] = apply(waiting, { tag: 'copy-invite-requested' })
    expect(copyCommands).toEqual([{ tag: 'copy-invite', code: '123456' }])

    const [copied] = apply(waiting, { tag: 'invite-copy-succeeded' })
    expect(copied).toEqual({
      tag: 'waiting',
      code: '123456',
      pendingSeed: 42,
      notice: 'Invite link copied.',
    })
  })

  it('host sends a sync snapshot when the guest reconnects mid-match', () => {
    const [playing] = hostToPlaying()
    if (playing.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    const [model, commands] = apply(playing, { tag: 'transport-peer-joined' })
    if (model.tag !== 'playing' || model.session.mode.tag !== 'remote') {
      throw new Error('expected remote playing state')
    }
    expect(model.session.mode.peerConnected).toBe(true)
    expect(commands[0]?.tag).toBe('transport-send')
    const payload =
      commands[0]?.tag === 'transport-send' ? commands[0].payload : null
    expect(payload).toMatchObject({ type: 'centurion:sync' })
  })

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
    // rank-flipped, so both pick the square they see as e2/e4. The arrow
    // phase runs, then Stockfish moves arrive, then the turn is sent.
    const [pendingModel, pendingCommands] = apply(
      mover,
      { tag: 'board-square-clicked', square: sq('e2') },
      { tag: 'board-square-clicked', square: sq('e4') },
    )
    const [movedModel, commands] = apply(
      pendingModel,
      engineAnswer(pendingCommands),
    )
    expect(commands).toHaveLength(1)
    const sent = commands[0]
    if (sent?.tag !== 'transport-send') {
      throw new Error('expected a transport-send command')
    }
    const payload = sent.payload as { moves: readonly string[] }
    expect(payload.moves.length).toBeGreaterThan(0)

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
    const moverFens = movedModel.session.match.games.map((game) =>
      makeFen(game.position.toSetup()),
    )
    const receiverFens = receivedModel.session.match.games.map((game) =>
      makeFen(game.position.toSetup()),
    )
    expect(receiverFens).toEqual(moverFens)
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
      payload: {
        type: 'centurion:arrow',
        from: 12,
        to: 28,
        turn: 99,
        moves: [],
      },
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
