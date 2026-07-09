import type { NewCommandLogEntry } from '../core/command-log/model'

/**
 * Durable sink for compiled natural-language commands, so translation
 * quality can be reviewed later against what players actually typed.
 * Recording is fire-and-forget: implementations must swallow their own
 * failures — losing a log entry must never affect play.
 */
export interface CommandLogPort {
  record(entry: NewCommandLogEntry): void
}
