# Agent workflow notes (Cursor + Claude Code Web)

This file is tool-agnostic on purpose and is intended for any coding agent working in this repo.

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
