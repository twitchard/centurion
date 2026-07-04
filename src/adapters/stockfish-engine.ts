import engineScriptUrl from 'stockfish/bin/stockfish-18-lite-single.js?url'
import engineWasmUrl from 'stockfish/bin/stockfish-18-lite-single.wasm?url'
import { MATE_CP } from '../core/match/model'
import type { RankedMove } from '../core/match/resolve'
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
  /** Centipawns from the mover's perspective; mates mapped near ±MATE_CP. */
  readonly cp: number
}

/** Extract rank, root move, and score from a MultiPV `info` line. */
export function parseMultiPvLine(line: string): MultiPvInfo | null {
  const match =
    /^info\b.*?\bmultipv (\d+)\b.*?\bscore (cp|mate) (-?\d+)\b.*?\bpv (\S+)/.exec(
      line,
    )
  if (match === null) {
    return null
  }
  const rank = Number(match[1])
  const kind = match[2]
  const value = Number(match[3])
  const move = match[4]
  if (move === undefined || !Number.isFinite(rank) || !Number.isFinite(value)) {
    return null
  }
  const cp =
    kind === 'mate' ? (value >= 0 ? MATE_CP - value : -MATE_CP - value) : value
  return { rank, move, cp }
}

export interface SearchPlan {
  /** Each distinct FEN, in first-appearance order. */
  readonly unique: readonly string[]
  /** For each input FEN, its index into `unique`. */
  readonly indices: readonly number[]
}

/**
 * Centurion matches hold many games in literally the same position — all
 * 100 start identical. Identical positions receive identical ranked
 * lists; the games still diverge because each one samples its own move
 * from the list with the match rng. Searching each distinct position
 * once routinely saves >90% of the engine work.
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
 * time, each resolving with the ranked root moves of the final
 * iteration.
 */
export class StockfishEngineAdapter implements EnginePort {
  private workerInit: Promise<Worker> | null = null
  private lineHandler: ((line: string) => void) | null = null
  private chain: Promise<unknown> = Promise.resolve()

  rankedMoves(
    fens: readonly string[],
    depth: number,
  ): Promise<readonly (readonly RankedMove[])[]> {
    const run = this.chain.then(async () => {
      const worker = await this.initWorker()
      worker.postMessage(`setoption name MultiPV value ${MULTIPV_ALL}`)
      const plan = planSearches(fens)
      const uniqueLists: (readonly RankedMove[])[] = []
      for (const fen of plan.unique) {
        uniqueLists.push(await this.searchRanked(worker, fen, depth))
      }
      return plan.indices.map((index) => {
        const list = uniqueLists[index]
        if (list === undefined) {
          throw new Error('Search plan produced a gap')
        }
        return list
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

  /**
   * With MultiPV covering every root move, the engine streams one ranked
   * `info` line per move per iteration; later lines overwrite earlier
   * ones per rank, so the map ends holding the deepest ranking. The
   * `bestmove` line closes the search.
   */
  private searchRanked(
    worker: Worker,
    fen: string,
    depth: number,
  ): Promise<readonly RankedMove[]> {
    return new Promise<readonly RankedMove[]>((resolve, reject) => {
      const ranked = new Map<number, RankedMove>()
      const timeout = setTimeout(() => {
        this.lineHandler = null
        reject(new Error('Stockfish search timed out'))
      }, SEARCH_TIMEOUT_MS)
      this.lineHandler = (line) => {
        const info = parseMultiPvLine(line)
        if (info !== null) {
          ranked.set(info.rank, { uci: info.move, cp: info.cp })
          return
        }
        const best = parseBestMoveLine(line)
        if (best === null && !line.startsWith('bestmove')) {
          return
        }
        this.lineHandler = null
        clearTimeout(timeout)
        const list = [...ranked.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, move]) => move)
        if (list.length === 0 && best !== null) {
          // Degenerate positions can skip info lines; trust bestmove.
          list.push({ uci: best, cp: 0 })
        }
        resolve(list)
      }
      worker.postMessage(`position fen ${fen}`)
      worker.postMessage(`go depth ${depth}`)
    })
  }
}
