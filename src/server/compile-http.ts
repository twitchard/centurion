import { describeCommandPredicate } from '../core/command/describe'
import { type CompileOptions, compileCommand } from './compile-command'

/**
 * Web-standard HTTP layer over `compileCommand`, shared by the Vercel
 * function (api/compile.ts) and the local Bun dev server. The endpoint is
 * public by design — the game is a static page on another origin — so
 * responses carry permissive CORS headers, and abuse is contained
 * structurally: 20-word input cap, forced tool output, small max_tokens.
 */

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  })
}

export function compilePreflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export interface CompileEndpointConfig {
  readonly apiKey: string | undefined
  readonly model?: string | undefined
  readonly fetch?: CompileOptions['fetch']
  readonly maxRetries?: number | undefined
}

export async function handleCompileRequest(
  request: Request,
  config: CompileEndpointConfig,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return compilePreflightResponse()
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Use POST.' })
  }
  if (config.apiKey === undefined || config.apiKey.length === 0) {
    return jsonResponse(503, {
      error: 'Command compiler is not configured (missing API key).',
    })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse(400, { error: 'Body must be JSON.' })
  }
  const command =
    typeof body === 'object' && body !== null && 'command' in body
      ? (body as { command: unknown }).command
      : undefined
  if (typeof command !== 'string') {
    return jsonResponse(400, { error: "Body needs a string 'command'." })
  }

  const outcome = await compileCommand(command, {
    apiKey: config.apiKey,
    model: config.model,
    fetch: config.fetch,
    maxRetries: config.maxRetries,
  })
  switch (outcome.tag) {
    case 'compiled':
      return jsonResponse(200, {
        predicate: outcome.predicate,
        description: describeCommandPredicate(outcome.predicate),
      })
    case 'rejected':
      return jsonResponse(outcome.status, {
        error: 'Command could not be compiled.',
        diagnostics: outcome.diagnostics,
      })
    case 'failed':
      return jsonResponse(outcome.status, { error: outcome.message })
  }
}
