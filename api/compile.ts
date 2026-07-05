import { commandCorpusSinkFromEnv } from '../src/server/command-corpus'
import { handleCompileRequest } from '../src/server/compile-http'

/**
 * Vercel Edge Function: POST /api/compile with {command: string}.
 * (OPTIONS preflight and method checks are handled inside
 * handleCompileRequest.) The compile pipeline calls the Anthropic API
 * with plain fetch, so it is edge-compatible.
 *
 * Configure ANTHROPIC_API_KEY (required) and COMMAND_COMPILE_MODEL
 * (optional) as environment variables in the Vercel project. The key
 * never ships to clients; the static game page calls this endpoint.
 *
 * Natural-language compile attempts are logged to stdout and, by default,
 * pushed to Firebase under `__trystero__/command-corpus` for corpus
 * building. Set COMMAND_CORPUS=off to disable, or COMMAND_CORPUS_PATH
 * to append JSONL when running outside Vercel.
 */

export const config = { runtime: 'edge' }

export default async function handler(request: Request): Promise<Response> {
  const {
    ANTHROPIC_API_KEY,
    COMMAND_COMPILE_MODEL,
    COMMAND_CORPUS,
    COMMAND_CORPUS_PATH,
    COMMAND_CORPUS_FIREBASE_URL,
  } = process.env
  return handleCompileRequest(request, {
    apiKey: ANTHROPIC_API_KEY,
    model: COMMAND_COMPILE_MODEL,
    corpusSink: commandCorpusSinkFromEnv(
      {
        COMMAND_CORPUS,
        COMMAND_CORPUS_PATH,
        COMMAND_CORPUS_FIREBASE_URL,
      },
      { firebase: true },
    ),
  })
}
