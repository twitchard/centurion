import { decodeCommandPredicate } from '../core/command/decode'
import type { CommandPredicate } from '../core/command/model'
import { tryCompileLiteralNotation } from '../core/command/parse-notation'
import {
  COMPILE_SYSTEM_PROMPT,
  SUBMIT_PREDICATE_INPUT_SCHEMA,
  SUBMIT_PREDICATE_TOOL_NAME,
} from '../core/command/prompt'
import { validateCommandText } from '../core/command/text'

/**
 * Default compile model. Compiling a short command against a cached system
 * prompt costs a fraction of a cent, so default to the strongest generally
 * available tier; COMMAND_COMPILE_MODEL overrides it (e.g. with
 * claude-haiku-4-5 once the eval battery shows it holds up).
 */
export const DEFAULT_COMPILE_MODEL = 'claude-opus-4-8'

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

export type CompileOutcome =
  | { readonly tag: 'compiled'; readonly predicate: CommandPredicate }
  /** The command or the model's predicate failed validation. */
  | {
      readonly tag: 'rejected'
      readonly status: number
      readonly diagnostics: readonly string[]
    }
  /** The upstream API call failed. */
  | {
      readonly tag: 'failed'
      readonly status: number
      readonly message: string
    }

export interface CompileOptions {
  readonly apiKey: string
  readonly model?: string | undefined
  /** Injected for tests; defaults to the platform fetch. */
  readonly fetch?: typeof globalThis.fetch | undefined
}

/**
 * The slice of an Anthropic Messages response this module reads. The
 * endpoint calls the API with plain fetch — the official SDK references
 * node:fs/node:path, which edge runtimes reject at build time.
 */
interface MessagesResponse {
  readonly content?: readonly {
    readonly type?: unknown
    readonly name?: unknown
    readonly input?: unknown
  }[]
}

function extractToolInput(message: MessagesResponse): unknown {
  for (const block of message.content ?? []) {
    if (
      block.type === 'tool_use' &&
      block.name === SUBMIT_PREDICATE_TOOL_NAME
    ) {
      return block.input
    }
  }
  return undefined
}

/**
 * Models sometimes JSON-encode structured tool arguments as strings,
 * especially under recursive schemas. Unwrap one level when it parses.
 */
function coerceJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

/**
 * Compile one natural-language command into a predicate. The LLM output
 * is untrusted: whatever it submits goes through `decodeCommandPredicate`,
 * and only a predicate that survives the codec is ever returned.
 */
export async function compileCommand(
  command: string,
  options: CompileOptions,
): Promise<CompileOutcome> {
  const validated = validateCommandText(command)
  if (validated.tag === 'invalid') {
    return { tag: 'rejected', status: 400, diagnostics: validated.diagnostics }
  }

  const literal = tryCompileLiteralNotation(validated.value)
  if (literal !== null) {
    const decoded = decodeCommandPredicate(literal)
    if (decoded.tag === 'valid') {
      return { tag: 'compiled', predicate: decoded.value }
    }
  }

  const fetchImpl = options.fetch ?? globalThis.fetch
  let response: Response
  try {
    response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'x-api-key': options.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model ?? DEFAULT_COMPILE_MODEL,
        max_tokens: 1024,
        system: [
          {
            type: 'text',
            text: COMPILE_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: [
          {
            name: SUBMIT_PREDICATE_TOOL_NAME,
            description:
              'Submit the move predicate compiled from the player command.',
            input_schema: SUBMIT_PREDICATE_INPUT_SCHEMA,
          },
        ],
        tool_choice: { type: 'tool', name: SUBMIT_PREDICATE_TOOL_NAME },
        messages: [{ role: 'user', content: validated.value }],
      }),
    })
  } catch (error) {
    return {
      tag: 'failed',
      status: 502,
      message: `Could not reach the compile model: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }
  if (!response.ok) {
    return {
      tag: 'failed',
      status: 502,
      message: `Compile model error (${response.status}).`,
    }
  }

  let message: MessagesResponse
  try {
    message = (await response.json()) as MessagesResponse
  } catch {
    return {
      tag: 'failed',
      status: 502,
      message: 'Compile model returned a non-JSON response.',
    }
  }

  const input = coerceJson(extractToolInput(message))
  if (input === undefined) {
    return {
      tag: 'failed',
      status: 502,
      message: 'Compile model returned no predicate.',
    }
  }

  // Accept both {predicate: ...} (the tool schema) and a bare predicate,
  // each possibly JSON-encoded as a string.
  const candidate = coerceJson(
    typeof input === 'object' && input !== null && 'predicate' in input
      ? (input as { predicate: unknown }).predicate
      : input,
  )
  const decoded = decodeCommandPredicate(candidate)
  if (decoded.tag === 'invalid') {
    return { tag: 'rejected', status: 422, diagnostics: decoded.diagnostics }
  }
  return { tag: 'compiled', predicate: decoded.value }
}
