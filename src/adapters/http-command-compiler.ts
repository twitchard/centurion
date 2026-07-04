import { decodeCommandPredicate } from '../core/command/decode'
import type {
  CommandCompileResult,
  CommandCompilerPort,
} from '../ports/command-compiler'

/**
 * Where compile requests go: api/compile.ts when the app is served by
 * Vercel, the local Bun server in dev, or wherever
 * VITE_COMMAND_COMPILER_URL points (e.g. GitHub Pages builds calling
 * the Vercel endpoint cross-origin).
 */
export function defaultCommandCompilerEndpoint(): string {
  const configured = import.meta.env.VITE_COMMAND_COMPILER_URL?.trim()
  if (configured !== undefined && configured.length > 0) {
    return configured
  }
  return import.meta.env.DEV
    ? 'http://localhost:8787/api/compile'
    : '/api/compile'
}

/**
 * Calls the compile endpoint (api/compile.ts on Vercel, or the local Bun
 * server) and re-validates the returned predicate through the codec —
 * the client never trusts the wire.
 */
export class HttpCommandCompilerAdapter implements CommandCompilerPort {
  private readonly fetchImpl: typeof globalThis.fetch

  constructor(fetchImpl?: typeof globalThis.fetch) {
    this.fetchImpl = fetchImpl ?? globalThis.fetch.bind(globalThis)
  }

  async compile(
    endpoint: string,
    command: string,
  ): Promise<CommandCompileResult> {
    let response: Response
    try {
      response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command }),
      })
    } catch (error) {
      return {
        tag: 'failed',
        message: `Could not reach the compiler: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }

    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      // Non-JSON bodies fall through to the status-based error below.
    }
    const record = (typeof body === 'object' && body !== null ? body : {}) as {
      predicate?: unknown
      error?: unknown
      diagnostics?: unknown
    }

    if (!response.ok) {
      const diagnostics = Array.isArray(record.diagnostics)
        ? record.diagnostics.map(String).join(' ')
        : ''
      const error =
        typeof record.error === 'string'
          ? record.error
          : `Compiler responded with status ${response.status}.`
      return {
        tag: 'failed',
        message: diagnostics.length > 0 ? `${error} ${diagnostics}` : error,
      }
    }

    const decoded = decodeCommandPredicate(record.predicate)
    if (decoded.tag === 'invalid') {
      return {
        tag: 'failed',
        message: `Compiler returned an invalid predicate: ${decoded.diagnostics.join(' ')}`,
      }
    }
    return { tag: 'compiled', predicate: decoded.value }
  }
}
