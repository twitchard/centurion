import { handleCompileRequest } from '../src/server/compile-http'

/**
 * Vercel Edge Function: POST /api/compile with {command: string}.
 * (OPTIONS preflight and method checks are handled inside
 * handleCompileRequest.)
 *
 * Configure ANTHROPIC_API_KEY (required) and COMMAND_COMPILE_MODEL
 * (optional) as environment variables in the Vercel project. The key
 * never ships to clients; the static game page calls this endpoint.
 */

export const config = { runtime: 'edge' }

export default async function handler(request: Request): Promise<Response> {
  const { ANTHROPIC_API_KEY, COMMAND_COMPILE_MODEL } = process.env
  return handleCompileRequest(request, {
    apiKey: ANTHROPIC_API_KEY,
    model: COMMAND_COMPILE_MODEL,
  })
}
