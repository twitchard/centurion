/**
 * Deployment canary: GET /api/ping answers with a marker so smoke tests
 * can tell which deployment is live and that functions run at all,
 * independent of the compile function's module graph.
 */

export const config = { runtime: 'edge' }

export default function handler(): Response {
  return new Response(JSON.stringify({ pong: true, marker: 'edge-1' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
