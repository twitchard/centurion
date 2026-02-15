import type { GameMode, PlayerNumber } from '../state/types'

export function updateScores(scores: [number, number]): void {
  const s1 = document.getElementById('s1')
  const s2 = document.getElementById('s2')
  if (s1) s1.textContent = `${scores[0]}`
  if (s2) s2.textContent = `${scores[1]}`
}

export function updateTurnIndicators(
  currentPlayer: PlayerNumber,
  mode: GameMode,
  localPlayer: PlayerNumber,
): void {
  const ti1 = document.getElementById('ti1')
  const ti2 = document.getElementById('ti2')
  if (!ti1 || !ti2) return

  if (mode === 'pass-and-play') {
    if (currentPlayer === 1) {
      ti1.className = 'turn-ind active'
      ti1.textContent = 'YOUR TURN'
      ti2.className = 'turn-ind waiting'
      ti2.textContent = 'WAITING'
    } else {
      ti2.className = 'turn-ind active'
      ti2.textContent = 'YOUR TURN'
      ti1.className = 'turn-ind waiting'
      ti1.textContent = 'WAITING'
    }
  } else {
    // Online mode: show perspective of local player
    const isMyTurn = currentPlayer === localPlayer
    const myInd = localPlayer === 1 ? ti1 : ti2
    const theirInd = localPlayer === 1 ? ti2 : ti1

    myInd.className = isMyTurn ? 'turn-ind active' : 'turn-ind waiting'
    myInd.textContent = isMyTurn ? 'YOUR TURN' : 'WAITING'
    theirInd.className = isMyTurn ? 'turn-ind waiting' : 'turn-ind active'
    theirInd.textContent = isMyTurn ? 'WAITING' : 'THEIR TURN'
  }
}

export function updateActiveCount(count: number): void {
  const el = document.getElementById('uiActive')
  if (el) el.textContent = `${count}`
}

export function updatePlayerLabels(
  mode: GameMode,
  localPlayer: PlayerNumber,
): void {
  const l1 = document.getElementById('label1')
  const l2 = document.getElementById('label2')
  if (!l1 || !l2) return

  if (mode === 'pass-and-play') {
    l1.textContent = 'Player 1'
    l2.textContent = 'Player 2'
  } else {
    if (localPlayer === 1) {
      l1.textContent = 'You'
      l2.textContent = 'Opponent'
    } else {
      l1.textContent = 'Opponent'
      l2.textContent = 'You'
    }
  }
}

export function setHint(text: string): void {
  const el = document.getElementById('hint')
  if (el) el.textContent = text
}
