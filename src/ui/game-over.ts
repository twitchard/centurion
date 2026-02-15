import type { MatchResult } from '../state/types'

export function showGameOver(result: MatchResult): void {
  const overlay = document.getElementById('screen-game-over')
  const title = document.getElementById('goTitle')
  const sub = document.getElementById('goSub')
  if (!overlay || !title || !sub) return

  overlay.style.display = 'flex'

  if (result.scores[0] > result.scores[1]) {
    title.textContent = 'Player 1 Wins!'
    title.style.color = '#98c379'
  } else if (result.scores[1] > result.scores[0]) {
    title.textContent = 'Player 2 Wins!'
    title.style.color = '#e06c75'
  } else {
    title.textContent = 'Match Drawn'
    title.style.color = '#ddd'
  }

  sub.textContent = `${result.scores[0]} \u2013 ${result.scores[1]}  \u00b7  ${result.gamesPlayed} games completed`
}
