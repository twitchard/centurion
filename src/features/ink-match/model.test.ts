import { describe, expect, it } from 'vitest'
import { bootInkSession, sessionPreview, updateInk } from './model'

describe('ink session', () => {
  it('boots into a search of every game', () => {
    const [model, commands] = bootInkSession(1, 'fair', 4)
    expect(model.session.match.games).toHaveLength(4)
    expect(model.session.searchSide).toBe('player')
    expect(commands).toHaveLength(1)
    expect(commands[0]?.fens).toHaveLength(4)
  })

  it('accepts ink while the position is being read, then previews it', () => {
    const [started, commands] = bootInkSession(1, 'fair', 2)
    const requestId = commands[0]?.requestId ?? 0
    const [drawing] = updateInk(started, {
      tag: 'stroke',
      points: line(),
    })
    expect(drawing.session.marks).toHaveLength(1)
    expect(sessionPreview(drawing)).toBeNull()

    const opening = [
      { uci: 'e2e4', cp: 30 },
      { uci: 'd2d4', cp: 20 },
      { uci: 'g1f3', cp: 10 },
    ]
    const [ready] = updateInk(drawing, {
      tag: 'ranks',
      requestId,
      ranked: [opening, opening],
    })
    expect(ready.session.searchId).toBeNull()
    const preview = sessionPreview(ready)
    expect(preview).not.toBeNull()
    expect(preview?.games).toBe(2)
  })

  it('commits the player, then plays the computer when its ranks arrive', () => {
    const [started, commands] = bootInkSession(5, 'fair', 2)
    const opening = [
      { uci: 'e2e4', cp: 30 },
      { uci: 'd2d4', cp: 10 },
      { uci: 'a2a3', cp: -20 },
    ]
    const [ready] = updateInk(started, {
      tag: 'ranks',
      requestId: commands[0]?.requestId ?? 0,
      ranked: [opening, opening],
    })
    const [afterPlayer, computerSearch] = updateInk(ready, { tag: 'pass' })
    expect(afterPlayer.session.match.turn).toBe(2)
    expect(afterPlayer.session.marks).toHaveLength(0)
    expect(computerSearch[0]?.tag).toBe('search')

    const reply = [
      { uci: 'e7e5', cp: 20 },
      { uci: 'c7c5', cp: 10 },
      { uci: 'a7a6', cp: -10 },
    ]
    const [afterComputer, playerSearch] = updateInk(afterPlayer, {
      tag: 'ranks',
      requestId: computerSearch[0]?.requestId ?? 0,
      ranked: [reply, reply],
    })
    expect(afterComputer.session.match.turn).toBe(3)
    expect(afterComputer.session.match.games[0]?.position.turn).toBe('white')
    expect(playerSearch[0]?.tag).toBe('search')
    expect(afterComputer.session.ranks).toBeNull()
  })

  it('ignores a stale engine result', () => {
    const [started, commands] = bootInkSession(1, 'fair', 1)
    const [restarted] = updateInk(started, {
      tag: 'restart',
      seed: 2,
      difficulty: 'hard',
      gameCount: 1,
    })
    const [still] = updateInk(restarted, {
      tag: 'ranks',
      requestId: commands[0]?.requestId ?? 0,
      ranked: [[{ uci: 'e2e4', cp: 10 }]],
    })
    expect(still.session.match.turn).toBe(1)
    expect(still.session.ranks).toBeNull()
    expect(still.session.match.difficulty).toBe('hard')
  })
})

function line() {
  const points = []
  for (let step = 0; step <= 6; step++) {
    points.push({ x: 4.5, y: 1.2 + step * 0.4 })
  }
  return points
}
