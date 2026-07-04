import { describeCommandPredicate } from './describe'
import type { CommandPredicate } from './model'
import {
  MAX_COMBINATOR_ARITY,
  MAX_PREDICATE_DEPTH,
  MAX_PREDICATE_NODES,
} from './model'
import { COMMAND_CHAR_LIMIT } from './text'

/** Tool the compiler model is forced to call with its predicate. */
export const SUBMIT_PREDICATE_TOOL_NAME = 'submit_predicate'

const REGION_SCHEMA = {
  type: 'object',
  description:
    'Board rectangle. Files are absolute letters a-h (kingside is e-h for both colors). Ranks are 1-8 counted from the side to move (1 = own back rank, 8 = promotion rank).',
  properties: {
    files: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          enum: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        },
        to: { type: 'string', enum: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] },
      },
      required: ['from', 'to'],
    },
    ranks: {
      type: 'object',
      properties: {
        from: { type: 'integer', minimum: 1, maximum: 8 },
        to: { type: 'integer', minimum: 1, maximum: 8 },
      },
      required: ['from', 'to'],
    },
  },
} as const

const ROLES_SCHEMA = {
  type: 'array',
  items: {
    type: 'string',
    enum: ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'],
  },
  minItems: 1,
} as const

/**
 * JSON schema for the submit tool. Recursive via $defs, so it cannot be
 * strict-validated by the API; it is guidance for the model, and
 * `decodeCommandPredicate` is the real validator.
 */
export const SUBMIT_PREDICATE_INPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    predicate: { $ref: '#/$defs/predicate' },
  },
  required: ['predicate'],
  $defs: {
    predicate: {
      oneOf: [
        {
          type: 'object',
          properties: { tag: { const: 'piece' }, roles: ROLES_SCHEMA },
          required: ['tag', 'roles'],
        },
        {
          type: 'object',
          properties: {
            tag: { enum: ['from', 'to'] },
            region: REGION_SCHEMA,
          },
          required: ['tag', 'region'],
        },
        {
          type: 'object',
          properties: { tag: { const: 'captures' }, roles: ROLES_SCHEMA },
          required: ['tag'],
        },
        {
          type: 'object',
          properties: {
            tag: {
              enum: [
                'gives-check',
                'checkmates',
                'castles',
                'promotes',
                'advances',
                'retreats',
                'escapes',
                'safe',
              ],
            },
          },
          required: ['tag'],
        },
        {
          type: 'object',
          properties: { tag: { const: 'attacks' }, roles: ROLES_SCHEMA },
          required: ['tag', 'roles'],
        },
        {
          type: 'object',
          properties: {
            tag: { const: 'not' },
            inner: { $ref: '#/$defs/predicate' },
          },
          required: ['tag', 'inner'],
        },
        {
          type: 'object',
          properties: {
            tag: { const: 'and' },
            all: {
              type: 'array',
              items: { $ref: '#/$defs/predicate' },
              minItems: 1,
              maxItems: MAX_COMBINATOR_ARITY,
            },
          },
          required: ['tag', 'all'],
        },
        {
          type: 'object',
          properties: {
            tag: { const: 'or' },
            any: {
              type: 'array',
              items: { $ref: '#/$defs/predicate' },
              minItems: 1,
              maxItems: MAX_COMBINATOR_ARITY,
            },
          },
          required: ['tag', 'any'],
        },
        {
          type: 'object',
          properties: {
            tag: { const: 'prefer' },
            options: {
              type: 'array',
              items: { $ref: '#/$defs/predicate' },
              minItems: 1,
              maxItems: MAX_COMBINATOR_ARITY,
            },
          },
          required: ['tag', 'options'],
        },
      ],
    },
  },
}

interface FewShotExample {
  readonly command: string
  readonly predicate: CommandPredicate
}

const FEW_SHOT_EXAMPLES: readonly FewShotExample[] = [
  {
    command: 'all knights advance',
    predicate: {
      tag: 'and',
      all: [{ tag: 'piece', roles: ['knight'] }, { tag: 'advances' }],
    },
  },
  {
    command: 'push the kingside pawns',
    predicate: {
      tag: 'and',
      all: [
        { tag: 'piece', roles: ['pawn'] },
        { tag: 'advances' },
        { tag: 'from', region: { files: { from: 'e', to: 'h' } } },
      ],
    },
  },
  {
    command: 'castle',
    predicate: { tag: 'castles' },
  },
  {
    command: 'take the queen',
    predicate: { tag: 'captures', roles: ['queen'] },
  },
  {
    command: 'give check',
    predicate: { tag: 'gives-check' },
  },
  {
    command: 'checkmate',
    predicate: { tag: 'checkmates' },
  },
  {
    command: 'do not move the queen',
    predicate: { tag: 'not', inner: { tag: 'piece', roles: ['queen'] } },
  },
  {
    command: 'retreat any piece that is under attack',
    predicate: {
      tag: 'and',
      all: [{ tag: 'escapes' }, { tag: 'retreats' }],
    },
  },
  {
    command: 'attack the enemy queen',
    predicate: { tag: 'attacks', roles: ['queen'] },
  },
  {
    command: 'promote a pawn',
    predicate: { tag: 'promotes' },
  },
  {
    command: 'advance to the sixth rank or beyond',
    predicate: {
      tag: 'and',
      all: [
        { tag: 'advances' },
        { tag: 'to', region: { ranks: { from: 6, to: 8 } } },
      ],
    },
  },
  {
    command: 'trade rooks',
    predicate: {
      tag: 'and',
      all: [
        { tag: 'piece', roles: ['rook'] },
        { tag: 'captures', roles: ['rook'] },
      ],
    },
  },
  {
    command: 'develop a minor piece',
    predicate: {
      tag: 'and',
      all: [
        { tag: 'piece', roles: ['knight', 'bishop'] },
        { tag: 'from', region: { ranks: { from: 1, to: 1 } } },
        { tag: 'advances' },
      ],
    },
  },
  {
    command: 'knight to f3',
    predicate: {
      tag: 'and',
      all: [
        { tag: 'piece', roles: ['knight'] },
        {
          tag: 'to',
          region: {
            files: { from: 'f', to: 'f' },
            ranks: { from: 3, to: 3 },
          },
        },
      ],
    },
  },
  {
    command: 'capture a queen or else a knight',
    predicate: {
      tag: 'prefer',
      options: [
        { tag: 'captures', roles: ['queen'] },
        { tag: 'captures', roles: ['knight'] },
      ],
    },
  },
  {
    command: 'castle preferring kingside',
    predicate: {
      tag: 'prefer',
      options: [
        {
          tag: 'and',
          all: [
            { tag: 'castles' },
            { tag: 'to', region: { files: { from: 'g', to: 'g' } } },
          ],
        },
        {
          tag: 'and',
          all: [
            { tag: 'castles' },
            { tag: 'to', region: { files: { from: 'c', to: 'c' } } },
          ],
        },
      ],
    },
  },
  {
    command: 'move the queen to safety',
    predicate: {
      tag: 'and',
      all: [{ tag: 'piece', roles: ['queen'] }, { tag: 'safe' }],
    },
  },
  {
    command: 'fork with knight if safe',
    predicate: {
      tag: 'and',
      all: [
        { tag: 'piece', roles: ['knight'] },
        { tag: 'attacks', roles: ['queen'] },
        { tag: 'attacks', roles: ['king'] },
        { tag: 'safe' },
      ],
    },
  },
  {
    command: 'promote if safe',
    predicate: {
      tag: 'and',
      all: [{ tag: 'promotes' }, { tag: 'safe' }],
    },
  },
]

function renderExample(example: FewShotExample): string {
  return [
    `Command: "${example.command}"`,
    `Predicate: ${JSON.stringify(example.predicate)}`,
    `Reads as: ${describeCommandPredicate(example.predicate)}`,
  ].join('\n')
}

/**
 * System prompt for the compile model. Stable text (it is the prompt-cache
 * prefix): the player's command is the only per-request content.
 */
export const COMPILE_SYSTEM_PROMPT = [
  'You compile natural-language chess commands into move predicates for Centurion Chess, a game played across 100 simultaneous chess games.',
  '',
  `The player types a command of at most ${COMMAND_CHAR_LIMIT} characters. You translate it into a single JSON predicate describing a property of one chess move. The predicate is applied independently to every game: in each game, the player's soldier (a deliberately imperfect engine) chooses its move among the legal moves matching the predicate, or among all legal moves if none match. The player issuing the command is the side to move in every game.`,
  '',
  'Call the submit_predicate tool with the predicate. Node kinds:',
  "- {tag: 'piece', roles: [...]} — the moving piece is one of these roles.",
  "- {tag: 'from', region} / {tag: 'to', region} — the move starts/ends inside the region. Files are absolute letters a-h (kingside = e-h for both colors). Ranks 1-8 are counted from the mover's side: 1 is the mover's back rank, 8 the promotion rank.",
  "- {tag: 'captures', roles?} — the move captures (optionally a piece of the given roles).",
  "- {tag: 'gives-check'} — the move gives check.",
  "- {tag: 'checkmates'} — the move delivers checkmate (not merely check).",
  "- {tag: 'castles'} — the move castles.",
  "- {tag: 'promotes'} — the move promotes a pawn.",
  "- {tag: 'advances'} / {tag: 'retreats'} — the move ends closer to / farther from the opponent's back rank.",
  "- {tag: 'attacks', roles: [...]} — after the move, the moved piece attacks an enemy piece of one of these roles.",
  "- {tag: 'escapes'} — the moving piece is currently attacked by an enemy piece.",
  "- {tag: 'safe'} — after the move, the moved piece is safe (undefended attacks lose a simplified exchange cascade).",
  "- {tag: 'not', inner} / {tag: 'and', all: [...]} / {tag: 'or', any: [...]} — combinators.",
  "- {tag: 'prefer', options: [...]} — try each option in order; use the first with any matching legal moves (for 'or else', 'preferring', 'if you can').",
  '',
  `Limits: at most ${MAX_PREDICATE_NODES} nodes and nesting depth ${MAX_PREDICATE_DEPTH}. Prefer the simplest predicate that captures the command's chess intent.`,
  '',
  'If the command names a specific square (like "f3"), read it as the player\'s own coordinates: file f, rank 3 from their side. If the command is not exactly expressible, produce the closest predicate that captures its main idea — never refuse, never invent per-game logic.',
  '',
  'Examples:',
  '',
  FEW_SHOT_EXAMPLES.map(renderExample).join('\n\n'),
].join('\n')
