import Anthropic from '@anthropic-ai/sdk'
import { decodeCommandPredicate } from '../core/command/decode'
import type { CommandPredicate } from '../core/command/model'
import {
  COMPILE_SYSTEM_PROMPT,
  SUBMIT_PREDICATE_INPUT_SCHEMA,
  SUBMIT_PREDICATE_TOOL_NAME,
} from '../core/command/prompt'
import { validateCommandText } from '../core/command/text'

/**
 * Default compile model. Compiling a 20-word command against a cached
 * system prompt costs a fraction of a cent, so default to the strongest
 * generally available tier; COMMAND_COMPILE_MODEL overrides it (e.g. with
 * claude-haiku-4-5 once the eval battery shows it holds up).
 */
export const DEFAULT_COMPILE_MODEL = 'claude-opus-4-8'

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
  readonly maxRetries?: number | undefined
}

function extractToolInput(message: Anthropic.Message): unknown {
  for (const block of message.content) {
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

  const client = new Anthropic({
    apiKey: options.apiKey,
    ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
    ...(options.maxRetries !== undefined
      ? { maxRetries: options.maxRetries }
      : {}),
  })

  let message: Anthropic.Message
  try {
    message = await client.messages.create({
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
          input_schema:
            SUBMIT_PREDICATE_INPUT_SCHEMA as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: SUBMIT_PREDICATE_TOOL_NAME },
      messages: [{ role: 'user', content: validated.value }],
    })
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return {
        tag: 'failed',
        status: 502,
        message: `Compile model error (${String(error.status ?? 'network')}).`,
      }
    }
    return {
      tag: 'failed',
      status: 502,
      message: error instanceof Error ? error.message : String(error),
    }
  }

  const input = extractToolInput(message)
  if (input === undefined) {
    return {
      tag: 'failed',
      status: 502,
      message: 'Compile model returned no predicate.',
    }
  }

  // Accept both {predicate: ...} (the tool schema) and a bare predicate.
  const candidate =
    typeof input === 'object' && input !== null && 'predicate' in input
      ? (input as { predicate: unknown }).predicate
      : input
  const decoded = decodeCommandPredicate(candidate)
  if (decoded.tag === 'invalid') {
    return { tag: 'rejected', status: 422, diagnostics: decoded.diagnostics }
  }
  return { tag: 'compiled', predicate: decoded.value }
}
