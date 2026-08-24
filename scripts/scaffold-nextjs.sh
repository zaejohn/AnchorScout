#!/usr/bin/env bash
set -euo pipefail

if [ -e web ]; then
  echo "web/ already exists. Refusing to overwrite it." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm was not found. Install pnpm, then rerun this script." >&2
  exit 1
fi

echo "Scaffolding current stable Next.js App Router application in web/..."
pnpm create next-app@latest web \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --use-pnpm \
  --import-alias '@/*' \
  --disable-git \
  --yes

if [ -f web/AGENTS.md ]; then
  printf '\n\n---\n\n' >> web/AGENTS.md
  cat templates/web-AGENTS.md >> web/AGENTS.md
  echo "[ok] Preserved create-next-app AGENTS.md and appended Stellar/full-stack rules"
else
  cp templates/web-AGENTS.md web/AGENTS.md
  echo "[ok] Installed Stellar/full-stack rules at web/AGENTS.md"
fi

cp templates/web-.env.example web/.env.example

echo "[ok] Next.js scaffold created in web/"
echo "Next: run pnpm --dir web dev or continue with docs/FIRST-RUN.md."
