import type {
  NodeCompileRequest,
  NodeCompileResponse,
} from '../src/server/compile-node'
import { handleNodeCompileRequest } from '../src/server/compile-node'

/**
 * Vercel function (Node.js runtime): POST /api/compile with
 * {command: string}. Runs on the Node runtime because the Anthropic SDK
 * references node:fs/node:path, which the Edge runtime rejects.
 *
 * Configure ANTHROPIC_API_KEY (required) and COMMAND_COMPILE_MODEL
 * (optional) as environment variables in the Vercel project. The key
 * never ships to clients; the static game page calls this endpoint.
 */

export default async function handler(
  req: NodeCompileRequest,
  res: NodeCompileResponse,
): Promise<void> {
  const { ANTHROPIC_API_KEY, COMMAND_COMPILE_MODEL } = process.env
  await handleNodeCompileRequest(req, res, {
    apiKey: ANTHROPIC_API_KEY,
    model: COMMAND_COMPILE_MODEL,
  })
}
