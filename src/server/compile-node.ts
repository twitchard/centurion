import {
  type CompileEndpointConfig,
  handleCompileRequest,
} from './compile-http'

/**
 * Adapter from Vercel's Node.js function signature (req, res) to the
 * shared Web-standard compile handler. The Edge runtime cannot host
 * this endpoint — the Anthropic SDK references node:fs/node:path — so
 * the function runs on the Node runtime, where Vercel expects a
 * default-exported (req, res) handler.
 *
 * The structural types below cover exactly the slice of
 * VercelRequest/VercelResponse this adapter touches, so no @vercel/node
 * dependency is needed and the adapter is unit-testable.
 */

export interface NodeCompileRequest {
  readonly method?: string | undefined
  /** Vercel parses JSON bodies before the handler runs. */
  readonly body?: unknown
}

export interface NodeCompileResponse {
  setHeader(name: string, value: string): void
  status(code: number): NodeCompileResponse
  send(body: string): void
  end(): void
}

export async function handleNodeCompileRequest(
  req: NodeCompileRequest,
  res: NodeCompileResponse,
  config: CompileEndpointConfig,
): Promise<void> {
  const method = req.method ?? 'GET'
  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    // Re-serialize the pre-parsed body; a non-JSON body arrives as
    // undefined and falls out as our handler's 400.
    body = req.body === undefined ? undefined : JSON.stringify(req.body)
  }
  const request = new Request('https://compile.invalid/api/compile', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body }),
  })

  const response = await handleCompileRequest(request, config)
  response.headers.forEach((value, name) => {
    res.setHeader(name, value)
  })
  res.status(response.status)
  const text = await response.text()
  if (text.length > 0) {
    res.send(text)
  } else {
    res.end()
  }
}
