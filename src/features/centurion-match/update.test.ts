import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import { makeUci, squareRank } from 'chessops/util'
import { describe, expect, it } from 'vitest'
import type { CommandPredicate } from '../../core/command/model'
import { activePlacer, otherPlayer } from '../../core/match/model'
import type { RankedMove } from '../../core/match/resolve'
import { type CenturionModel, initCenturionModel } from './model'
import { type CenturionCmd, type CenturionMsg, updateCenturion } from './update'

const KNIGHTS: CommandPredicate = { tag: 'piece', roles: ['knight'] }

/** Stand-in for Stockfish in tests: every legal move at cp 0. */
function rankedFor(fen: string): RankedMove[] {
  const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
  const moves: RankedMove[] = []
  for (const [from, dests] of position.allDests()) {
    for (const to of dests) {
      const isPawn = position.board.getRole(from) === 'pawn'
      const toRank = squareRank(to)
      const uci =
        isPawn && (toRank === 0 || toRank === 7)
          ? makeUci({ from, to, promotion: 'queen' })
          : makeUci({ from, to })
      moves.push({ uci, cp: 0 })
    }
  }
  return moves
}

/**
 * Run the async half of a turn: take the compute-ranked-moves command
 * issued by the reducer, answer it with flat rankings, and return the
 * follow-up message.
 */
function engineAnswer(
  commands: ReturnType<typeof updateCenturion>[1],
): CenturionMsg {
  const compute = commands.find((cmd) => cmd.tag === 'compute-ranked-moves')
  if (compute === undefined || compute.tag !== 'compute-ranked-moves') {
    throw new Error('expected a compute-ranked-moves command')
  }
  return {
    tag: 'ranked-moves-computed',
    ranked: compute.fens.map(rankedFor),
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

function submitCommandMsgs(text: string): CenturionMsg[] {
  return [
    { tag: 'command-input-updated', value: text },
    { tag: 'command-issue-requested' },
  ]
}

function compileFinished(text: string): CenturionMsg {
  return {
    tag: 'command-compile-finished',
    text,
    result: { tag: 'compiled', predicate: KNIGHTS },
  }
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

  it('starts compiling when a command is submitted', () => {
    const [model, commands] = apply(
      initCenturionModel(),
      { tag: 'pass-and-play-requested', seed: 11 },
      ...submitCommandMsgs('all knights advance'),
    )
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(model.session.draft).toEqual({
      tag: 'compiling',
      text: 'all knights advance',
    })
    expect(commands).toEqual([
      { tag: 'compile-command', text: 'all knights advance' },
    ])
  })

  it('submits a command and resolves the turn', () => {
    const [compilingModel, compileCommands] = apply(
      initCenturionModel(),
      { tag: 'pass-and-play-requested', seed: 11 },
      ...submitCommandMsgs('all knights advance'),
    )
    expect(compileCommands).toEqual([
      { tag: 'compile-command', text: 'all knights advance' },
    ])

    const [pendingModel, rankCommands] = apply(
      compilingModel,
      compileFinished('all knights advance'),
    )
    if (pendingModel.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(pendingModel.session.resolving).not.toBeNull()
    expect(pendingModel.session.match.turn).toBe(1)

    const [model] = apply(pendingModel, engineAnswer(rankCommands))
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(model.session.resolving).toBeNull()
    expect(model.session.match.turn).toBe(2)
    expect(model.session.match.commands).toHaveLength(1)
    expect(model.session.match.commands[0]?.text).toBe('all knights advance')
    expect(model.session.match.commands[0]?.commandMoves).toBe(100)
    expect(model.session.commandInput).toBe('')
    expect(model.session.draft).toEqual({ tag: 'idle' })
    for (const game of model.session.match.games) {
      expect(game.moves[0]?.source).toBe('command')
    }
  })

  it('passes the turn without a command', () => {
    const [pendingModel, commands] = apply(
      initCenturionModel(),
      { tag: 'pass-and-play-requested', seed: 11 },
      { tag: 'pass-requested' },
    )
    const [model] = apply(pendingModel, engineAnswer(commands))
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(model.session.match.turn).toBe(2)
    expect(model.session.match.commands).toHaveLength(0)
    for (const game of model.session.match.games) {
      expect(game.moves[0]?.source).toBe('free')
    }
  })

  it('rejects empty and over-limit commands on submit', () => {
    const base = apply(initCenturionModel(), {
      tag: 'pass-and-play-requested',
      seed: 11,
    })[0]

    const [empty] = apply(base, { tag: 'command-issue-requested' })
    if (empty.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(empty.session.inputError).toContain('empty')

    const [tooLong] = apply(
      base,
      { tag: 'command-input-updated', value: 'word '.repeat(21) },
      { tag: 'command-issue-requested' },
    )
    if (tooLong.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(tooLong.session.inputError).toContain('21 words')
  })

  it('invalidates the draft when the text changes and drops stale results', () => {
    const [compiling] = apply(
      initCenturionModel(),
      { tag: 'pass-and-play-requested', seed: 11 },
      ...submitCommandMsgs('all knights advance'),
    )
    const [edited] = apply(compiling, {
      tag: 'command-input-updated',
      value: 'push pawns',
    })
    if (edited.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(edited.session.draft).toEqual({ tag: 'idle' })

    const [stale] = apply(edited, compileFinished('all knights advance'))
    if (stale.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(stale.session.draft).toEqual({ tag: 'idle' })
    expect(stale.session.resolving).toBeNull()
  })

  it('surfaces compile failures on the draft', () => {
    const [model] = apply(
      initCenturionModel(),
      { tag: 'pass-and-play-requested', seed: 11 },
      ...submitCommandMsgs('castle'),
      {
        tag: 'command-compile-finished',
        text: 'castle',
        result: { tag: 'failed', message: 'endpoint unreachable' },
      },
    )
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(model.session.draft).toEqual({
      tag: 'failed',
      text: 'castle',
      message: 'endpoint unreachable',
    })
  })

  it('abandons the turn when the engine fails', () => {
    const [pendingModel] = apply(
      initCenturionModel(),
      { tag: 'pass-and-play-requested', seed: 11 },
      { tag: 'pass-requested' },
    )
    const [model] = apply(pendingModel, {
      tag: 'ranked-moves-failed',
      message: 'worker crashed.',
    })
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(model.session.resolving).toBeNull()
    expect(model.session.match.turn).toBe(1)
    expect(model.session.notice).toContain('worker crashed')
  })

  it('blocks turn actions while resolving', () => {
    const [pendingModel] = apply(
      initCenturionModel(),
      { tag: 'pass-and-play-requested', seed: 11 },
      { tag: 'pass-requested' },
    )
    const [model, commands] = apply(pendingModel, { tag: 'pass-requested' })
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(commands).toEqual([])
    expect(model.session.inputError).toContain('resolving')
  })
})

describe('solo mode', () => {
  it('plays two half-turns per command: yours ordered, black unled', () => {
    const [compilingFirst, compileCommands] = apply(
      initCenturionModel(),
      { tag: 'solo-requested', seed: 21 },
      ...submitCommandMsgs('all knights advance'),
    )
    const [pendingFirst, firstCommands] = apply(
      compilingFirst,
      compileFinished('all knights advance'),
    )
    if (pendingFirst.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    expect(pendingFirst.session.mode).toEqual({ tag: 'solo' })
    expect(compileCommands).toEqual([
      { tag: 'compile-command', text: 'all knights advance' },
    ])
    // The player always owns white in solo.
    expect(pendingFirst.session.match.games[0]?.whiteOwner).toBe(1)

    // First engine answer settles the white ply, then the black ply
    // begins automatically with another ranked search.
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
    for (const game of model.session.match.games) {
      expect(game.position.fullmoves).toBe(2)
      expect(game.position.turn).toBe('white')
      expect(game.moves[0]?.source).toBe('command')
      expect(game.moves[1]?.source).toBe('free')
    }
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

  it('keeps both players in lockstep across an exchanged command', () => {
    const [host, hostCommands] = hostToPlaying()
    const [guest] = guestFromHost(hostCommands)
    if (host.tag !== 'playing' || guest.tag !== 'playing') {
      throw new Error('expected playing states')
    }

    const commander = activePlacer(host.session.match)
    const [mover, receiver] = commander === 1 ? [host, guest] : [guest, host]

    const [compilingModel] = apply(
      mover,
      ...submitCommandMsgs('all knights advance'),
    )
    const [pendingModel, pendingCommands] = apply(
      compilingModel,
      compileFinished('all knights advance'),
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
    expect(receivedModel.session.match.commands).toEqual(
      movedModel.session.match.commands,
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

  it('rejects turn actions when it is not your turn', () => {
    const [host] = hostToPlaying()
    if (host.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    const notYourTurn = activePlacer(host.session.match) === otherPlayer(1)
    const [model, commands] = apply(host, { tag: 'pass-requested' })
    if (model.tag !== 'playing') {
      throw new Error('expected playing state')
    }
    if (notYourTurn) {
      expect(model.session.inputError).not.toBeNull()
      expect(commands).toEqual([])
    } else {
      expect(model.session.resolving).not.toBeNull()
      expect(commands.map((cmd) => cmd.tag)).toEqual(['compute-ranked-moves'])
    }
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
