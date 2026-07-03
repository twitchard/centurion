import { describe, expect, it } from 'vitest'
import type { CommandPredicate } from '../core/command/model'
import { compileCommand } from './compile-command'
import { handleCompileRequest } from './compile-http'

const KNIGHTS_ADVANCE: CommandPredicate = {
  tag: 'and',
  all: [{ tag: 'piece', roles: ['knight'] }, { tag: 'advances' }],
}

function anthropicMessage(toolInput: unknown): unknown {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-4-8',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_test',
        name: 'submit_predicate',
        input: toolInput,
      },
    ],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  }
}

function fetchReturning(
  payload: unknown,
  status = 200,
): typeof globalThis.fetch {
  return async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    })
}

describe('compileCommand', () => {
  it('decodes the predicate the model submits', async () => {
    const outcome = await compileCommand('all knights advance', {
      apiKey: 'test-key',
      fetch: fetchReturning(anthropicMessage({ predicate: KNIGHTS_ADVANCE })),
    })
    expect(outcome).toEqual({ tag: 'compiled', predicate: KNIGHTS_ADVANCE })
  })

  it('accepts a bare predicate without the wrapper key', async () => {
    const outcome = await compileCommand('all knights advance', {
      apiKey: 'test-key',
      fetch: fetchReturning(anthropicMessage(KNIGHTS_ADVANCE)),
    })
    expect(outcome).toEqual({ tag: 'compiled', predicate: KNIGHTS_ADVANCE })
  })

  it('accepts a JSON-string-encoded predicate value', async () => {
    const outcome = await compileCommand('all knights advance', {
      apiKey: 'test-key',
      fetch: fetchReturning(
        anthropicMessage({ predicate: JSON.stringify(KNIGHTS_ADVANCE) }),
      ),
    })
    expect(outcome).toEqual({ tag: 'compiled', predicate: KNIGHTS_ADVANCE })
  })

  it('accepts a JSON-string-encoded whole tool input', async () => {
    const outcome = await compileCommand('all knights advance', {
      apiKey: 'test-key',
      fetch: fetchReturning(
        anthropicMessage(JSON.stringify({ predicate: KNIGHTS_ADVANCE })),
      ),
    })
    expect(outcome).toEqual({ tag: 'compiled', predicate: KNIGHTS_ADVANCE })
  })

  it('rejects over-limit commands without calling the API', async () => {
    const outcome = await compileCommand('word '.repeat(21), {
      apiKey: 'test-key',
      fetch: () => {
        throw new Error('should not be called')
      },
    })
    expect(outcome.tag).toBe('rejected')
    if (outcome.tag === 'rejected') {
      expect(outcome.status).toBe(400)
    }
  })

  it('rejects model output that fails the codec', async () => {
    const outcome = await compileCommand('all knights advance', {
      apiKey: 'test-key',
      fetch: fetchReturning(
        anthropicMessage({ predicate: { tag: 'best-move' } }),
      ),
    })
    expect(outcome.tag).toBe('rejected')
    if (outcome.tag === 'rejected') {
      expect(outcome.status).toBe(422)
    }
  })

  it('reports upstream API failures', async () => {
    const outcome = await compileCommand('all knights advance', {
      apiKey: 'test-key',
      fetch: fetchReturning(
        { type: 'error', error: { type: 'api_error', message: 'boom' } },
        500,
      ),
    })
    expect(outcome.tag).toBe('failed')
    if (outcome.tag === 'failed') {
      expect(outcome.status).toBe(502)
    }
  })

  it('reports network failures', async () => {
    const outcome = await compileCommand('all knights advance', {
      apiKey: 'test-key',
      fetch: () => Promise.reject(new Error('connection refused')),
    })
    expect(outcome.tag).toBe('failed')
    if (outcome.tag === 'failed') {
      expect(outcome.message).toContain('connection refused')
    }
  })
})

function compileRequest(body: unknown): Request {
  return new Request('http://localhost/api/compile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('handleCompileRequest', () => {
  it('answers preflight requests', async () => {
    const response = await handleCompileRequest(
      new Request('http://localhost/api/compile', { method: 'OPTIONS' }),
      { apiKey: 'test-key' },
    )
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('fails closed when no API key is configured', async () => {
    const response = await handleCompileRequest(
      compileRequest({ command: 'castle' }),
      { apiKey: undefined },
    )
    expect(response.status).toBe(503)
  })

  it('rejects bodies without a command string', async () => {
    const response = await handleCompileRequest(compileRequest({}), {
      apiKey: 'test-key',
    })
    expect(response.status).toBe(400)
  })

  it('returns the predicate with its description', async () => {
    const response = await handleCompileRequest(
      compileRequest({ command: 'all knights advance' }),
      {
        apiKey: 'test-key',
        fetch: fetchReturning(anthropicMessage({ predicate: KNIGHTS_ADVANCE })),
      },
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      predicate: unknown
      description: string
    }
    expect(body.predicate).toEqual(KNIGHTS_ADVANCE)
    expect(body.description).toBe('a move by a knight and that advances')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
  })
})
