import engineScriptUrl from 'stockfish/bin/stockfish-18-lite-single.js?url'
import engineWasmUrl from 'stockfish/bin/stockfish-18-lite-single.wasm?url'
import type { EnginePort } from '../ports/engine'

const SEARCH_TIMEOUT_MS = 30_000

/**
 * Stockfish caps MultiPV at 256, comfortably above the legal-move
 * maximum (~218), so a full-MultiPV search ranks every root move.
 */
const MULTIPV_ALL = 256

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

export interface MultiPvInfo {
  readonly rank: number
  readonly move: string
}

/** Extract the rank and root move from a MultiPV `info` line. */
export function parseMultiPvLine(line: string): MultiPvInfo | null {
  const match = /^info\b.*?\bmultipv (\d+)\b.*?\bpv (\S+)/.exec(line)
  if (match === null) {
    return null
  }
  const rank = Number(match[1])
  const move = match[2]
  if (move === undefined || !Number.isFinite(rank)) {
    return null
  }
  return { rank, move }
}

export interface SearchPlan {
  /** Each distinct FEN, in first-appearance order. */
  readonly unique: readonly string[]
  /** For each input FEN, its index into `unique`. */
  readonly indices: readonly number[]
}

/**
 * Centurion matches hold many games in literally the same position —
 * all 100 start identical, and identical positions receive identical
 * engine moves, so groups only split when an arrow picks one game out.
 * Searching each distinct position once routinely saves >90% of the
 * engine work (and guarantees identical positions get identical moves
 * regardless of transposition-table carry-over between searches).
 */
export function planSearches(fens: readonly string[]): SearchPlan {
  const unique: string[] = []
  const byFen = new Map<string, number>()
  const indices = fens.map((fen) => {
    const existing = byFen.get(fen)
    if (existing !== undefined) {
      return existing
    }
    const index = unique.length
    unique.push(fen)
    byFen.set(fen, index)
    return index
  })
  return { unique, indices }
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
    return this.runBatch(fens, 1, (worker, fen) =>
      this.search(worker, fen, depth),
    )
  }

  worstMoves(
    fens: readonly string[],
    depth: number,
  ): Promise<readonly string[]> {
    return this.runBatch(fens, MULTIPV_ALL, (worker, fen) =>
      this.searchWorst(worker, fen, depth),
    )
  }

  private runBatch(
    fens: readonly string[],
    multiPv: number,
    searchOne: (worker: Worker, fen: string) => Promise<string>,
  ): Promise<readonly string[]> {
    const run = this.chain.then(async () => {
      const worker = await this.initWorker()
      // Every batch states its own MultiPV, so best- and worst-move
      // batches can interleave without leaking the option.
      worker.postMessage(`setoption name MultiPV value ${multiPv}`)
      const plan = planSearches(fens)
      const uniqueMoves: string[] = []
      for (const fen of plan.unique) {
        uniqueMoves.push(await searchOne(worker, fen))
      }
      return plan.indices.map((index) => {
        const move = uniqueMoves[index]
        if (move === undefined) {
          throw new Error('Search plan produced a gap')
        }
        return move
      })
    })
    // Keep the chain alive even if a batch fails, so the next call runs.
    this.chain = run.catch(() => undefined)
    return run
  }

  private initWorker(): Promise<Worker> {
    if (this.workerInit === null) {
      this.workerInit = new Promise<Worker>((resolve, reject) => {
        // The build emits relative asset URLs (base './' for subpath
        // hosting); resolve them against the page before handing them to
        // the worker, where relative URLs would resolve against the
        // worker script instead. The stockfish.js worker reads the wasm
        // location from its hash.
        const scriptUrl = new URL(engineScriptUrl, window.location.href).href
        const wasmUrl = new URL(engineWasmUrl, window.location.href).href
        const worker = new Worker(`${scriptUrl}#${encodeURIComponent(wasmUrl)}`)
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

  /**
   * With MultiPV covering every root move, the engine streams one
   * ranked `info` line per move per iteration; the highest rank at the
   * final iteration is the worst move. Later lines overwrite earlier
   * ones per rank, and every iteration ranks the same move count, so
   * the map ends holding the deepest ranking.
   */
  private searchWorst(
    worker: Worker,
    fen: string,
    depth: number,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const ranked = new Map<number, string>()
      const timeout = setTimeout(() => {
        this.lineHandler = null
        reject(new Error('Stockfish search timed out'))
      }, SEARCH_TIMEOUT_MS)
      this.lineHandler = (line) => {
        const info = parseMultiPvLine(line)
        if (info !== null) {
          ranked.set(info.rank, info.move)
          return
        }
        const best = parseBestMoveLine(line)
        if (best === null) {
          return
        }
        this.lineHandler = null
        clearTimeout(timeout)
        const worstRank = Math.max(0, ...ranked.keys())
        resolve(ranked.get(worstRank) ?? best)
      }
      worker.postMessage(`position fen ${fen}`)
      worker.postMessage(`go depth ${depth}`)
    })
  }
}
