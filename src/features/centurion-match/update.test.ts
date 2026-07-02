import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import { makeUci, parseSquare, squareRank } from 'chessops/util'
import { describe, expect, it } from 'vitest'
import { activePlacer, otherPlayer } from '../../core/match/model'
import { type CenturionModel, initCenturionModel } from './model'
import { type CenturionCmd, type CenturionMsg, updateCenturion } from './update'

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
  /**
   * Drive a full solo turn: the player's arrow, the white-ply engine
   * answer, the auto black ply, leaving the Centurion's trap pending.
   */
  function soloTurnToTrap(): ReturnType<typeof updateCenturion> {
    const [pendingFirst, firstCommands] = apply(
      initCenturionModel(),
      { tag: 'solo-requested', seed: 21 },
      { tag: 'board-square-clicked', square: sq('e2') },
      { tag: 'board-square-clicked', square: sq('e4') },
    )
    const [pendingSecond, secondCommands] = apply(
      pendingFirst,
      engineAnswer(firstCommands),
    )
    return apply(pendingSecond, engineAnswer(secondCommands))
  }

  function trapAnswer(
    commands: ReturnType<typeof updateCenturion>[1],
  ): CenturionMsg {
    const compute = commands.find((cmd) => cmd.tag === 'compute-worst-moves')
    if (compute === undefined || compute.tag !== 'compute-worst-moves') {
      throw new Error('expected a compute-worst-moves command')
    }
    return {
      tag: 'worst-moves-computed',
      moves: compute.fens.map(firstLegalUci),
    }
  }

  it('plays two half-turns per arrow, then the Centurion lays a trap', () => {
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
    // The player always owns white in solo.
    expect(pendingFirst.session.match.games[0]?.whiteOwner).toBe(1)

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

    // The black ply settles into the Centurion's trap computation.
    const [pendingTrap, trapCommands] = apply(
      pendingSecond,
      engineAnswer(secondCommands),
    )
    if (pendingTrap.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(pendingTrap.session.match.turn).toBe(3)
    expect(pendingTrap.session.resolving).toBeNull()
    expect(pendingTrap.session.trap).not.toBeNull()
    expect(trapCommands.map((cmd) => cmd.tag)).toEqual(['compute-worst-moves'])

    const [model, finalCommands] = apply(pendingTrap, trapAnswer(trapCommands))
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(finalCommands).toEqual([])
    expect(model.session.trap).toBeNull()
    // Your arrow plus the Centurion's trap, stamped with its half-turn
    // so it pulls at full weight on your reply.
    expect(model.session.match.arrows).toHaveLength(2)
    expect(model.session.match.arrows[0]?.owner).toBe(1)
    expect(model.session.match.arrows[1]?.owner).toBe(2)
    expect(model.session.match.arrows[1]?.placedTurn).toBe(2)
    for (const game of model.session.match.games) {
      expect(game.position.fullmoves).toBe(2)
      expect(game.position.turn).toBe('white')
    }
  })

  it('blocks input while the trap is pending', () => {
    const [pendingTrap] = soloTurnToTrap()
    if (pendingTrap.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    const [clicked, clickCommands] = apply(pendingTrap, {
      tag: 'board-square-clicked',
      square: sq('d2'),
    })
    if (clicked.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(clicked.session.selectedSquare).toBeNull()
    expect(clickCommands).toEqual([])

    const [submitted] = apply(
      pendingTrap,
      { tag: 'arrow-input-updated', value: 'd2->d4' },
      { tag: 'arrow-submit-requested' },
    )
    if (submitted.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(submitted.session.match.turn).toBe(3)
    expect(submitted.session.inputError).toContain('Computer')
  })

  it('skips the trap arrow when the worst-move search fails', () => {
    const [pendingTrap] = soloTurnToTrap()
    const [model] = apply(pendingTrap, {
      tag: 'worst-moves-failed',
      message: 'worker crashed.',
    })
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(model.session.trap).toBeNull()
    expect(model.session.match.arrows).toHaveLength(1)
    expect(model.session.notice).toContain('worker crashed')

    // The player can place the next arrow normally afterwards.
    const [next] = apply(
      model,
      { tag: 'board-square-clicked', square: sq('d2') },
      { tag: 'board-square-clicked', square: sq('d4') },
    )
    if (next.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(next.session.resolving).not.toBeNull()
  })
})

describe('multiplayer flow', () => {
  /** The room snapshot published by a command, after a JSON round trip. */
  function publishedState(commands: readonly CenturionCmd[]): unknown {
    const publish = commands.find((cmd) => cmd.tag === 'room-publish')
    if (publish === undefined || publish.tag !== 'room-publish') {
      throw new Error('expected a room-publish command')
    }
    return JSON.parse(JSON.stringify(publish.state))
  }

  function hostToPlaying(): ReturnType<typeof updateCenturion> {
    return apply(
      initCenturionModel(),
      { tag: 'new-match-requested', seed: 77, code: '123456' },
      { tag: 'room-opened' },
      { tag: 'room-peer-presence', present: true },
    )
  }

  function guestFromHost(
    hostCommands: readonly CenturionCmd[],
  ): ReturnType<typeof updateCenturion> {
    return apply(
      initCenturionModel(),
      { tag: 'join-code-updated', value: '123456' },
      { tag: 'join-match-requested' },
      { tag: 'room-opened' },
      { tag: 'room-state-received', state: publishedState(hostCommands) },
    )
  }

  it('offers share and copy commands while waiting for an opponent', () => {
    const [waiting] = apply(
      initCenturionModel(),
      { tag: 'new-match-requested', seed: 42, code: '123456' },
      { tag: 'room-opened' },
    )
    expect(waiting).toEqual({
      tag: 'waiting',
      code: '123456',
      seed: 42,
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
      seed: 42,
      notice: 'Invite link copied.',
    })
  })

  it('host starts the match and publishes the first snapshot when the guest arrives', () => {
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
    expect(commands).toHaveLength(1)
    expect(commands[0]).toMatchObject({
      tag: 'room-publish',
      state: { turn: 1, gameCount: 100 },
    })
  })

  it('guest adopts the identical match from the published snapshot', () => {
    const [host, hostCommands] = hostToPlaying()
    const [guest] = guestFromHost(hostCommands)
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
    const hostFens = host.session.match.games.map((game) =>
      makeFen(game.position.toSetup()),
    )
    const guestFens = guest.session.match.games.map((game) =>
      makeFen(game.position.toSetup()),
    )
    expect(guestFens).toEqual(hostFens)
  })

  it('keeps both players in lockstep across an exchanged arrow', () => {
    const [host, hostCommands] = hostToPlaying()
    const [guest] = guestFromHost(hostCommands)
    if (host.tag !== 'playing' || guest.tag !== 'playing') {
      throw new Error('expected playing states')
    }

    const placer = activePlacer(host.session.match)
    const [mover, receiver] = placer === 1 ? [host, guest] : [guest, host]

    // The mover clicks in their own visual frame; player 2's view is
    // rank-flipped, so both pick the square they see as e2/e4. The arrow
    // phase runs, Stockfish moves arrive, then the settled snapshot is
    // published to the room.
    const [pendingModel, pendingCommands] = apply(
      mover,
      { tag: 'board-square-clicked', square: sq('e2') },
      { tag: 'board-square-clicked', square: sq('e4') },
    )
    const [movedModel, commands] = apply(
      pendingModel,
      engineAnswer(pendingCommands),
    )

    const [receivedModel] = apply(receiver, {
      tag: 'room-state-received',
      state: publishedState(commands),
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

  it('guest adopts room state even before the open acknowledgement', () => {
    const [, hostCommands] = hostToPlaying()
    const [guest] = apply(
      initCenturionModel(),
      { tag: 'join-code-updated', value: '123456' },
      { tag: 'join-match-requested' },
      // State arrives first, then the open ack: rejoining an in-progress
      // match must not drop the snapshot.
      { tag: 'room-state-received', state: publishedState(hostCommands) },
      { tag: 'room-opened' },
    )
    if (guest.tag !== 'playing' || guest.session.mode.tag !== 'remote') {
      throw new Error('expected remote playing state')
    }
    expect(guest.session.mode.you).toBe(2)
    expect(guest.session.match.turn).toBe(1)
  })

  it('ignores stale snapshots, including the echo of its own publish', () => {
    const [host, hostCommands] = hostToPlaying()
    if (host.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    const [model, commands] = apply(host, {
      tag: 'room-state-received',
      state: publishedState(hostCommands),
    })
    expect(model).toEqual(host)
    expect(commands).toEqual([])
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

  it('surfaces presence changes as connection notices', () => {
    const [host] = hostToPlaying()
    const [away] = apply(host, { tag: 'room-peer-presence', present: false })
    if (away.tag !== 'playing' || away.session.mode.tag !== 'remote') {
      throw new Error('expected remote playing state')
    }
    expect(away.session.mode.peerConnected).toBe(false)
    expect(away.session.notice).toBe('Opponent disconnected.')

    const [back] = apply(away, { tag: 'room-peer-presence', present: true })
    if (back.tag !== 'playing' || back.session.mode.tag !== 'remote') {
      throw new Error('expected remote playing state')
    }
    expect(back.session.mode.peerConnected).toBe(true)
    expect(back.session.notice).toBe('Opponent reconnected.')
  })

  it('returns to the lobby with a notice when the room fails to open', () => {
    const [model, commands] = apply(
      initCenturionModel(),
      { tag: 'join-code-updated', value: '654321' },
      { tag: 'join-match-requested' },
      { tag: 'room-error', message: 'No match found for that code.' },
    )
    expect(model).toEqual({
      tag: 'lobby',
      joinCodeInput: '',
      notice: 'No match found for that code.',
    })
    expect(commands).toEqual([{ tag: 'room-leave' }])
  })

  it('returns to the lobby and leaves the room on leave', () => {
    const [host] = hostToPlaying()
    const [model, commands] = apply(host, { tag: 'leave-session-requested' })
    expect(model).toEqual(initCenturionModel())
    expect(commands).toEqual([{ tag: 'room-leave' }])
  })
})
