import { type ParseResult, invalid, valid } from '../parsing/types'
import {
  type CommandPredicate,
  FILE_LETTERS,
  type FileLetter,
  MAX_COMBINATOR_ARITY,
  MAX_PREDICATE_DEPTH,
  MAX_PREDICATE_NODES,
  PIECE_ROLES,
  type PieceRole,
  type SquareRegion,
  predicateNodeCount,
} from './model'

/**
 * Decode untrusted JSON into a CommandPredicate. This is the trust
 * boundary: everything the LLM emits — and everything that arrives over
 * the wire in a match snapshot — passes through here before it can touch
 * match state.
 */
export function decodeCommandPredicate(
  input: unknown,
): ParseResult<CommandPredicate> {
  const diagnostics: string[] = []
  const predicate = decodeNode(input, 'predicate', 1, diagnostics)
  if (predicate === null || diagnostics.length > 0) {
    return invalid(diagnostics)
  }
  const nodes = predicateNodeCount(predicate)
  if (nodes > MAX_PREDICATE_NODES) {
    return invalid([
      `Predicate has ${nodes} nodes; the limit is ${MAX_PREDICATE_NODES}.`,
    ])
  }
  return valid(predicate)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function decodeRoles(
  value: unknown,
  path: string,
  diagnostics: string[],
): readonly PieceRole[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(`${path}: expected a non-empty array of piece roles.`)
    return null
  }
  const roles: PieceRole[] = []
  for (const entry of value) {
    if (
      typeof entry !== 'string' ||
      !(PIECE_ROLES as readonly string[]).includes(entry)
    ) {
      diagnostics.push(
        `${path}: '${String(entry)}' is not a piece role (${PIECE_ROLES.join(', ')}).`,
      )
      return null
    }
    if (!roles.includes(entry as PieceRole)) {
      roles.push(entry as PieceRole)
    }
  }
  return roles
}

function decodeRegion(
  value: unknown,
  path: string,
  diagnostics: string[],
): SquareRegion | null {
  if (!isRecord(value)) {
    diagnostics.push(`${path}: expected an object with 'files' and/or 'ranks'.`)
    return null
  }
  const region = value as {
    files?: unknown
    ranks?: unknown
    absolute?: unknown
  }
  let files: SquareRegion['files']
  if (region.files !== undefined) {
    if (!isRecord(region.files)) {
      diagnostics.push(`${path}.files: expected { from, to } file letters.`)
      return null
    }
    const { from, to } = region.files as { from?: unknown; to?: unknown }
    if (!isFileLetter(from) || !isFileLetter(to) || from > to) {
      diagnostics.push(
        `${path}.files: expected file letters a-h with from <= to.`,
      )
      return null
    }
    files = { from, to }
  }
  let ranks: SquareRegion['ranks']
  if (region.ranks !== undefined) {
    if (!isRecord(region.ranks)) {
      diagnostics.push(`${path}.ranks: expected { from, to } ranks 1-8.`)
      return null
    }
    const { from, to } = region.ranks as { from?: unknown; to?: unknown }
    if (!isRankNumber(from) || !isRankNumber(to) || from > to) {
      diagnostics.push(`${path}.ranks: expected ranks 1-8 with from <= to.`)
      return null
    }
    ranks = { from, to }
  }
  if (files === undefined && ranks === undefined) {
    diagnostics.push(`${path}: region needs at least 'files' or 'ranks'.`)
    return null
  }
  if (region.absolute !== undefined && region.absolute !== true) {
    diagnostics.push(`${path}.absolute: expected true when present.`)
    return null
  }
  const absolute = region.absolute === true ? true : undefined
  if (files !== undefined && ranks !== undefined) {
    return absolute === undefined
      ? { files, ranks }
      : { files, ranks, absolute }
  }
  if (files !== undefined) {
    return absolute === undefined ? { files } : { files, absolute }
  }
  if (ranks !== undefined) {
    return absolute === undefined ? { ranks } : { ranks, absolute }
  }
  return null
}

function isFileLetter(value: unknown): value is FileLetter {
  return (
    typeof value === 'string' &&
    (FILE_LETTERS as readonly string[]).includes(value)
  )
}

function isRankNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 8
  )
}

function decodeChildren(
  value: unknown,
  path: string,
  depth: number,
  diagnostics: string[],
): readonly CommandPredicate[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_COMBINATOR_ARITY
  ) {
    diagnostics.push(
      `${path}: expected 1-${MAX_COMBINATOR_ARITY} child predicates.`,
    )
    return null
  }
  const children: CommandPredicate[] = []
  for (let index = 0; index < value.length; index++) {
    const child = decodeNode(
      value[index],
      `${path}[${index}]`,
      depth,
      diagnostics,
    )
    if (child === null) {
      return null
    }
    children.push(child)
  }
  return children
}

function decodeNode(
  input: unknown,
  path: string,
  depth: number,
  diagnostics: string[],
): CommandPredicate | null {
  if (depth > MAX_PREDICATE_DEPTH) {
    diagnostics.push(
      `${path}: predicate exceeds the nesting limit of ${MAX_PREDICATE_DEPTH}.`,
    )
    return null
  }
  if (!isRecord(input)) {
    diagnostics.push(`${path}: expected a predicate object with a 'tag'.`)
    return null
  }
  const node = input as {
    tag?: unknown
    roles?: unknown
    region?: unknown
    inner?: unknown
    all?: unknown
    any?: unknown
    options?: unknown
  }
  switch (node.tag) {
    case 'piece': {
      const roles = decodeRoles(node.roles, `${path}.roles`, diagnostics)
      return roles === null ? null : { tag: 'piece', roles }
    }
    case 'from':
    case 'to': {
      const region = decodeRegion(node.region, `${path}.region`, diagnostics)
      return region === null ? null : { tag: node.tag, region }
    }
    case 'captures': {
      if (node.roles === undefined) {
        return { tag: 'captures' }
      }
      const roles = decodeRoles(node.roles, `${path}.roles`, diagnostics)
      return roles === null ? null : { tag: 'captures', roles }
    }
    case 'gives-check':
    case 'checkmates':
    case 'castles':
    case 'promotes':
    case 'advances':
    case 'retreats':
    case 'escapes':
    case 'safe':
      return { tag: node.tag }
    case 'attacks': {
      const roles = decodeRoles(node.roles, `${path}.roles`, diagnostics)
      return roles === null ? null : { tag: 'attacks', roles }
    }
    case 'not': {
      const inner = decodeNode(
        node.inner,
        `${path}.inner`,
        depth + 1,
        diagnostics,
      )
      return inner === null ? null : { tag: 'not', inner }
    }
    case 'and': {
      const all = decodeChildren(
        node.all,
        `${path}.all`,
        depth + 1,
        diagnostics,
      )
      return all === null ? null : { tag: 'and', all }
    }
    case 'or': {
      const any = decodeChildren(
        node.any,
        `${path}.any`,
        depth + 1,
        diagnostics,
      )
      return any === null ? null : { tag: 'or', any }
    }
    case 'prefer': {
      const options = decodeChildren(
        node.options,
        `${path}.options`,
        depth + 1,
        diagnostics,
      )
      return options === null ? null : { tag: 'prefer', options }
    }
    default:
      diagnostics.push(`${path}: unknown predicate tag '${String(node.tag)}'.`)
      return null
  }
}
