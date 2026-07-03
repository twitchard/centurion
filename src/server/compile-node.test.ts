import { describe, expect, it } from 'vitest'
import {
  type NodeCompileResponse,
  handleNodeCompileRequest,
} from './compile-node'

class FakeResponse implements NodeCompileResponse {
  statusCode = 0
  body = ''
  ended = false
  readonly headers = new Map<string, string>()

  setHeader(name: string, value: string): void {
    this.headers.set(name, value)
  }

  status(code: number): NodeCompileResponse {
    this.statusCode = code
    return this
  }

  send(body: string): void {
    this.body = body
    this.ended = true
  }

  end(): void {
    this.ended = true
  }
}

describe('handleNodeCompileRequest', () => {
  it('answers OPTIONS preflights without a body', async () => {
    const res = new FakeResponse()
    await handleNodeCompileRequest({ method: 'OPTIONS' }, res, {
      apiKey: 'test-key',
    })
    expect(res.statusCode).toBe(204)
    expect(res.ended).toBe(true)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('rejects non-POST methods', async () => {
    const res = new FakeResponse()
    await handleNodeCompileRequest({ method: 'GET' }, res, {
      apiKey: 'test-key',
    })
    expect(res.statusCode).toBe(405)
  })

  it('passes the parsed body through to the shared handler', async () => {
    const res = new FakeResponse()
    await handleNodeCompileRequest(
      { method: 'POST', body: { command: 42 } },
      res,
      { apiKey: 'test-key' },
    )
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('command')
  })

  it('fails closed without an API key', async () => {
    const res = new FakeResponse()
    await handleNodeCompileRequest(
      { method: 'POST', body: { command: 'castle' } },
      res,
      { apiKey: undefined },
    )
    expect(res.statusCode).toBe(503)
  })
})
