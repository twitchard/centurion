import type { ConnectionStatus } from '../net/types'

/** Update the "Create Room" lobby screen */
export function updateCreateLobby(
  code: string,
  status: ConnectionStatus,
): void {
  const codeEl = document.getElementById('room-code-display')
  const statusEl = document.getElementById('create-status')
  if (codeEl) codeEl.textContent = code
  if (statusEl) {
    switch (status) {
      case 'waiting':
        statusEl.textContent = 'Waiting for opponent...'
        statusEl.className = 'lobby-status waiting'
        break
      case 'connected':
        statusEl.textContent = 'Opponent connected!'
        statusEl.className = 'lobby-status connected'
        break
      case 'error':
        statusEl.textContent = 'Connection error. Try again.'
        statusEl.className = 'lobby-status error'
        break
      default:
        statusEl.textContent = 'Connecting...'
        statusEl.className = 'lobby-status'
    }
  }
}

/** Update the "Join Room" lobby screen */
export function updateJoinLobby(status: ConnectionStatus): void {
  const statusEl = document.getElementById('join-status')
  const btn = document.getElementById('join-btn') as HTMLButtonElement | null
  if (statusEl) {
    switch (status) {
      case 'connecting':
        statusEl.textContent = 'Connecting...'
        statusEl.className = 'lobby-status'
        if (btn) btn.disabled = true
        break
      case 'connected':
        statusEl.textContent = 'Connected!'
        statusEl.className = 'lobby-status connected'
        break
      case 'error':
        statusEl.textContent = 'Could not connect. Check the code.'
        statusEl.className = 'lobby-status error'
        if (btn) btn.disabled = false
        break
      default:
        statusEl.textContent = ''
        if (btn) btn.disabled = false
    }
  }
}

/** Copy room code or use Web Share API */
export async function shareRoomCode(code: string): Promise<void> {
  const url = window.location.href
  const text = `Join my Centurion Chess game! Code: ${code}`

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Centurion Chess', text, url })
      return
    } catch {
      // Fall through to clipboard
    }
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${url}`)
    const btn = document.getElementById('share-btn')
    if (btn) {
      const original = btn.textContent
      btn.textContent = 'Copied!'
      setTimeout(() => {
        btn.textContent = original
      }, 1500)
    }
  } catch {
    // Fallback: select a hidden input
    prompt('Share this code:', code)
  }
}
