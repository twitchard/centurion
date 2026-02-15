export type Screen =
  | 'start'
  | 'lobby-create'
  | 'lobby-join'
  | 'game'
  | 'game-over'

const ALL_SCREENS: Screen[] = [
  'start',
  'lobby-create',
  'lobby-join',
  'game',
  'game-over',
]

/** Show one screen, hide the rest */
export function showScreen(screen: Screen): void {
  for (const s of ALL_SCREENS) {
    const el = document.getElementById(`screen-${s}`)
    if (el) {
      el.style.display = s === screen ? 'flex' : 'none'
    }
  }
  // The game app container is special
  const app = document.getElementById('app')
  if (app) {
    app.style.display = screen === 'game' ? 'flex' : 'none'
  }
}
