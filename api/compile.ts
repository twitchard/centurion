import {
  compilePreflightResponse,
  handleCompileRequest,
} from '../src/server/compile-http'

/**
 * Vercel serverless function: POST /api/compile with {command: string}.
 *
 * Configure ANTHROPIC_API_KEY (required) and COMMAND_COMPILE_MODEL
 * (optional) as environment variables in the Vercel project. The key
 * never ships to clients; the static game page calls this endpoint.
 */

export function OPTIONS(): Response {
  return compilePreflightResponse()
}

export async function POST(request: Request): Promise<Response> {
  const { ANTHROPIC_API_KEY, COMMAND_COMPILE_MODEL } = process.env
  return handleCompileRequest(request, {
    apiKey: ANTHROPIC_API_KEY,
    model: COMMAND_COMPILE_MODEL,
  })
}
