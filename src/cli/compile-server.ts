import { commandCorpusSinkFromEnv } from '../server/command-corpus'
import { handleCompileRequest } from '../server/compile-http'

/**
 * Local stand-in for the Vercel compile endpoint, for developing the
 * command lab without a deploy:
 *
 *   ANTHROPIC_API_KEY=sk-... bun run command:server
 *
 * Serves POST /api/compile on port 8787 (COMMAND_COMPILE_PORT overrides),
 * which is the command lab's default endpoint in dev.
 *
 * Compile attempts append to data/command-corpus.jsonl by default.
 */

const {
  ANTHROPIC_API_KEY,
  COMMAND_COMPILE_MODEL,
  COMMAND_COMPILE_PORT,
  COMMAND_CORPUS,
  COMMAND_CORPUS_PATH,
  COMMAND_CORPUS_FIREBASE_URL,
} = process.env
const port = Number(COMMAND_COMPILE_PORT ?? '8787')
const apiKey = ANTHROPIC_API_KEY
const model = COMMAND_COMPILE_MODEL
const corpusSink = commandCorpusSinkFromEnv(
  {
    COMMAND_CORPUS,
    COMMAND_CORPUS_PATH,
    COMMAND_CORPUS_FIREBASE_URL,
  },
  {
    filePath: 'data/command-corpus.jsonl',
  },
)

if (apiKey === undefined || apiKey.length === 0) {
  console.error('ANTHROPIC_API_KEY is not set; compile requests will get 503.')
}

Bun.serve({
  port,
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname !== '/api/compile') {
      return new Response('Not found', { status: 404 })
    }
    return handleCompileRequest(request, { apiKey, model, corpusSink })
  },
})

console.log(
  `Command compile server listening on http://localhost:${port}/api/compile`,
)
