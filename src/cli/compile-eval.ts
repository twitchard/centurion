import { Chess } from 'chessops/chess'
import { describeCommandPredicate } from '../core/command/describe'
import { matchingMoves } from '../core/command/evaluate'
import {
  DEFAULT_COMPILE_MODEL,
  compileCommand,
} from '../server/compile-command'

/**
 * Eval battery for the command compiler: runs a fixed set of phrases
 * through the real API and prints the compiled predicate, its English
 * reading, and the matching moves in the starting position. Use it to
 * judge whether a cheaper model holds up before switching
 * COMMAND_COMPILE_MODEL:
 *
 *   ANTHROPIC_API_KEY=sk-... bun run command:eval
 *   ANTHROPIC_API_KEY=sk-... COMMAND_COMPILE_MODEL=claude-haiku-4-5 bun run command:eval
 */

const PHRASES: readonly string[] = [
  'all knights advance',
  'push the kingside pawns',
  'castle if you can',
  'take the queen',
  'give check',
  'do not move the queen or the king',
  'retreat any piece that is under attack',
  'attack the enemy queen with a minor piece',
  'advance a pawn to the sixth rank or beyond',
  'trade rooks',
  'develop a minor piece toward the center',
  'knight to f3',
]

const { ANTHROPIC_API_KEY, COMMAND_COMPILE_MODEL } = process.env
const apiKey = ANTHROPIC_API_KEY
if (apiKey === undefined || apiKey.length === 0) {
  console.error('Set ANTHROPIC_API_KEY to run the compile eval.')
  process.exit(1)
}
const model = COMMAND_COMPILE_MODEL ?? DEFAULT_COMPILE_MODEL

console.log(`Compile eval against ${model}\n`)

let failures = 0
for (const phrase of PHRASES) {
  const outcome = await compileCommand(phrase, { apiKey, model })
  console.log(`Command: "${phrase}"`)
  if (outcome.tag !== 'compiled') {
    failures += 1
    console.log(`  ${outcome.tag}: ${JSON.stringify(outcome)}\n`)
    continue
  }
  const sans = matchingMoves(Chess.default(), outcome.predicate).map(
    (match) => match.san,
  )
  console.log(`  Predicate: ${JSON.stringify(outcome.predicate)}`)
  console.log(`  Reads as:  ${describeCommandPredicate(outcome.predicate)}`)
  console.log(
    `  Start-position matches: ${sans.length === 0 ? '(none)' : sans.join(' ')}\n`,
  )
}

console.log(
  failures === 0
    ? 'All phrases compiled.'
    : `${failures} of ${PHRASES.length} phrases failed to compile.`,
)
process.exit(failures === 0 ? 0 : 1)
