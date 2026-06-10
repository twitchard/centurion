const MAX_ENTRIES = 80

const entries: string[] = []

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function appendConnectionLog(message: string): void {
  entries.push(`${formatTime(new Date())} ${message}`)
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES)
  }
}

export function clearConnectionLog(): void {
  entries.length = 0
}

export function connectionLogEntries(): readonly string[] {
  return entries
}

export function renderConnectionLog(list: HTMLOListElement): void {
  list.innerHTML = ''
  for (const entry of entries) {
    const item = document.createElement('li')
    item.textContent = entry
    list.appendChild(item)
  }
  list.scrollTop = list.scrollHeight
}
