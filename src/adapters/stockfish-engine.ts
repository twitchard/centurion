import engineScriptUrl from 'stockfish/bin/stockfish-18-lite-single.js?url'
import engineWasmUrl from 'stockfish/bin/stockfish-18-lite-single.wasm?url'
import type { EnginePort } from '../ports/engine'

const SEARCH_TIMEOUT_MS = 30_000

export function parseBestMoveLine(line: string): string | null {
  const match = /^bestmove\s+(\S+)/.exec(line)
  if (match === null) {
    return null
  }
  const move = match[1]
  if (move === undefined || move === '(none)') {
    return null
  }
  return move
}

/**
 * Single-threaded Stockfish (WASM) behind a web worker, speaking UCI.
 * Searches are serialised: one `position`/`go depth N` exchange at a
 * time, each resolving with the engine's `bestmove`.
 */
export class StockfishEngineAdapter implements EnginePort {
  private workerInit: Promise<Worker> | null = null
  private lineHandler: ((line: string) => void) | null = null
  private chain: Promise<unknown> = Promise.resolve()

  bestMoves(
    fens: readonly string[],
    depth: number,
  ): Promise<readonly string[]> {
    const run = this.chain.then(async () => {
      const worker = await this.initWorker()
      const moves: string[] = []
      for (const fen of fens) {
        moves.push(await this.search(worker, fen, depth))
      }
      return moves
    })
    // Keep the chain alive even if a batch fails, so the next call runs.
    this.chain = run.catch(() => undefined)
    return run
  }

  private initWorker(): Promise<Worker> {
    if (this.workerInit === null) {
      this.workerInit = new Promise<Worker>((resolve, reject) => {
        // The stockfish.js worker reads the wasm location from its hash.
        const worker = new Worker(
          `${engineScriptUrl}#${encodeURIComponent(engineWasmUrl)}`,
        )
        let initialised = false
        worker.onerror = (event) => {
          if (!initialised) {
            this.workerInit = null
            reject(new Error(`Stockfish worker failed: ${event.message}`))
          }
        }
        worker.onmessage = (event) => {
          const line = String(event.data)
          if (!initialised && line.startsWith('uciok')) {
            initialised = true
            resolve(worker)
            return
          }
          this.lineHandler?.(line)
        }
        worker.postMessage('uci')
      })
    }
    return this.workerInit
  }

  private search(worker: Worker, fen: string, depth: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.lineHandler = null
        reject(new Error('Stockfish search timed out'))
      }, SEARCH_TIMEOUT_MS)
      this.lineHandler = (line) => {
        const move = parseBestMoveLine(line)
        if (move === null) {
          return
        }
        this.lineHandler = null
        clearTimeout(timeout)
        resolve(move)
      }
      worker.postMessage(`position fen ${fen}`)
      worker.postMessage(`go depth ${depth}`)
    })
  }
}
