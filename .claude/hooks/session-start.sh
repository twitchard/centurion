#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

echo "Installing dependencies..."
bun install

echo "Installing Playwright browsers..."
bunx playwright install chromium --with-deps || echo "Warning: Playwright browser install failed (screenshots may not work)"

echo "Starting Vite dev server on port 5173..."
nohup bun run dev:cloud > /tmp/vite-dev.log 2>&1 &
echo "Dev server PID: $!"

echo "Session start complete."
