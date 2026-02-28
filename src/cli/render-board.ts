#!/usr/bin/env bun
/**
 * CLI superposition board renderer.
 *
 * Usage:
 *   bun run board:cli --fens "rnbqkbnr/.../RNBQKBNR w KQkq - 0 1"
 *   echo "<fen>" | bun run board:cli
 *
 * Options:
 *   --fens <string>    Newline- or semicolon-separated FEN list
 *   --arrows <string>  Comma- or newline-separated arrow list (e.g. e2->e4)
 *   --help             Show this help
 */

import { buildSuperpositionRenderModel } from '../core/superposition/build-render-model'
import { parseArrowList } from '../core/superposition/parse-arrow-list'
import { parseFenList } from '../core/superposition/parse-fen-list'
import type {
  FenPieceSymbol,
  SuperpositionRenderModel,
} from '../core/superposition/types'

// ── Unicode glyphs ────────────────────────────────────────────────────────────

const GLYPHS: Record<FenPieceSymbol, string> = {
  P: '♙',
  N: '♘',
  B: '♗',
  R: '♖',
  Q: '♕',
  K: '♔',
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
}

// ── ASCII board renderer ──────────────────────────────────────────────────────

function renderBoard(model: SuperpositionRenderModel): string {
  // Build a map: square index → display string
  const squareMap = new Map<number, string>()
  const total = Math.max(1, model.positionCount)

  for (const layer of model.squareLayers) {
    const dominant = layer.stacks[0]
    if (dominant === undefined) {
      continue
    }
    const glyph = GLYPHS[dominant.piece]
    const label =
      total === 1
        ? glyph
        : `${glyph}${dominant.count < total ? `×${dominant.count}` : ''}`
    squareMap.set(layer.square, label)
  }

  const colLabels = '  a   b   c   d   e   f   g   h'
  const separator = `  ${'+---'.repeat(8)}+`
  const lines: string[] = [colLabels, separator]

  for (let rank = 7; rank >= 0; rank--) {
    const cells: string[] = []
    for (let file = 0; file < 8; file++) {
      const square = rank * 8 + file
      const cell = squareMap.get(square) ?? '.'
      // Pad to 3 chars for alignment (glyphs are 1 wide, ×N suffix adds chars)
      cells.push(cell.padEnd(3))
    }
    lines.push(`${rank + 1} |${cells.join('|')}| ${rank + 1}`)
    lines.push(separator)
  }
  lines.push(colLabels)

  if (model.arrows.length > 0) {
    lines.push('')
    lines.push('Arrows:')
    for (const arrow of model.arrows) {
      const from = `${String.fromCharCode(97 + arrow.from.col)}${arrow.from.row + 1}`
      const to = `${String.fromCharCode(97 + arrow.to.col)}${arrow.to.row + 1}`
      lines.push(`  ${from} → ${to}`)
    }
  }

  return lines.join('\n')
}

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  fens: string
  arrows: string
  help: boolean
} {
  let fens = ''
  let arrows = ''
  let help = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--fens' || arg === '--fen') {
      fens = argv[i + 1] ?? ''
      i++
    } else if (arg === '--arrows' || arg === '--arrow') {
      arrows = argv[i + 1] ?? ''
      i++
    }
  }

  return { fens, arrows, help }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { fens, arrows, help } = parseArgs(Bun.argv.slice(2))

  if (help) {
    console.log(`Usage: bun run board:cli [options]

Options:
  --fens <string>    Newline- or semicolon-separated FEN positions
  --arrows <string>  Arrow list (e.g. "e2->e4,d2->d4")
  --help             Show this help

If --fens is omitted, reads FEN list from stdin.

Examples:
  bun run board:cli --fens "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
  bun run board:cli --fens "$(cat positions.txt)" --arrows "e2->e4"
  echo "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" | bun run board:cli`)
    return
  }

  let fenInput = fens
  if (fenInput.trim().length === 0) {
    // Read from stdin
    fenInput = await Bun.stdin.text()
  }

  const fenResult = parseFenList(fenInput)
  if (fenResult.tag === 'invalid') {
    for (const d of fenResult.diagnostics) {
      process.stderr.write(`Error: ${d}\n`)
    }
    process.exit(1)
  }

  const arrowResult = parseArrowList(arrows)
  if (arrowResult.tag === 'invalid') {
    for (const d of arrowResult.diagnostics) {
      process.stderr.write(`Error: ${d}\n`)
    }
    process.exit(1)
  }

  const renderModel = buildSuperpositionRenderModel(
    fenResult.value,
    arrowResult.value,
  )

  console.log(`Superposition of ${renderModel.positionCount} position(s):\n`)
  console.log(renderBoard(renderModel))
}

await main()
