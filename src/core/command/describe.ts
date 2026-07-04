import type { CommandPredicate, PieceRole, SquareRegion } from './model'

/**
 * Deterministic English rendering of a predicate — the echo the player
 * sees before committing a command, so a mistranslation reads as
 * information rather than a betrayal.
 */
export function describeCommandPredicate(predicate: CommandPredicate): string {
  return `a move ${clause(predicate)}`
}

function roleList(roles: readonly PieceRole[]): string {
  return roles.join(' or ')
}

function regionText(region: SquareRegion): string {
  const parts: string[] = []
  if (region.files !== undefined) {
    parts.push(
      region.files.from === region.files.to
        ? `the ${region.files.from}-file`
        : `files ${region.files.from}-${region.files.to}`,
    )
  }
  if (region.ranks !== undefined) {
    const rankLabel = region.absolute === true ? 'rank' : 'your rank'
    parts.push(
      region.ranks.from === region.ranks.to
        ? `${rankLabel} ${region.ranks.from}`
        : `${rankLabel}s ${region.ranks.from}-${region.ranks.to}`,
    )
  }
  if (
    region.absolute === true &&
    region.files !== undefined &&
    region.ranks !== undefined &&
    region.files.from === region.files.to &&
    region.ranks.from === region.ranks.to
  ) {
    return `${region.files.from}${region.ranks.from}`
  }
  return parts.join(' and ')
}

function clause(predicate: CommandPredicate): string {
  switch (predicate.tag) {
    case 'piece':
      return `by a ${roleList(predicate.roles)}`
    case 'from':
      return `starting on ${regionText(predicate.region)}`
    case 'to':
      return `ending on ${regionText(predicate.region)}`
    case 'captures':
      return predicate.roles === undefined
        ? 'that captures'
        : `that captures a ${roleList(predicate.roles)}`
    case 'gives-check':
      return 'that gives check'
    case 'checkmates':
      return 'that delivers checkmate'
    case 'castles':
      return 'that castles'
    case 'promotes':
      return 'that promotes'
    case 'advances':
      return 'that advances'
    case 'retreats':
      return 'that retreats'
    case 'attacks':
      return `that attacks an enemy ${roleList(predicate.roles)}`
    case 'escapes':
      return 'by a piece that is under attack'
    case 'safe':
      return 'that lands safe'
    case 'not':
      return `not (${clause(predicate.inner)})`
    case 'and':
      return predicate.all.map(clause).join(' and ')
    case 'or':
      return `(${predicate.any.map(clause).join(' or ')})`
    case 'prefer':
      return predicate.options
        .map((option, index) =>
          index === 0 ? clause(option) : `else ${clause(option)}`,
        )
        .join(', ')
  }
}
