# Agent workflow notes (Cursor + Claude Code Web)

This file is tool-agnostic on purpose and is intended for any coding agent working in this repo.

## No temporary stopgaps policy (required)

Do not leave temporary stopgaps in committed code.

Examples of disallowed stopgaps include:
- placeholder state shapes or fake model fields used only to satisfy types
- temporary command plumbing that only throws, no-ops, or says "for this revision"
- TODO/FIXME/HACK markers that defer required behavior in production paths
- temporary UI copy or controls that are not part of the intended product flow

Before merging, agents must:
1. Replace temporary scaffolding with final behavior, or remove it entirely.
2. Keep types explicit and accurate (no fake casts or placeholder model objects).
3. Remove dead branches/no-op handlers introduced only as interim wiring.
4. Run the full validation sequence (`bun run ci:all`) after cleanup.

If a complete solution is genuinely blocked, do not silently ship a stopgap.
Document the blocker clearly in the PR summary and stop until direction is provided.

## CI parity command

GitHub Actions (`.github/workflows/deploy.yml`) runs these validation checks in order:

1. `bun run check`
2. `bun run typecheck`
3. `bun run test`
4. `bun run build`

To run the same checks locally with one command, use:

```bash
bun run ci:all
```

## Typical local sequence

```bash
bun install --frozen-lockfile
bun run ci:all
```

Notes:
- `ci:all` mirrors the build job's validation steps.
- The deploy step in GitHub Actions is environment-specific and is not part of local validation.
