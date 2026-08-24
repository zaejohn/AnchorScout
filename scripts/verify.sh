#!/usr/bin/env bash
set -euo pipefail

if [ -f Cargo.toml ]; then
  cargo test
  stellar contract build
elif [ -d contracts ]; then
  while IFS= read -r manifest; do
    cargo test --manifest-path "$manifest"
    stellar contract build --manifest-path "$manifest"
  done < <(find contracts -name Cargo.toml -type f)
fi

verify_node_project() {
  local dir="$1"
  [ -f "$dir/package.json" ] || return 0

  local runner
  if [ -f "$dir/pnpm-lock.yaml" ]; then runner=pnpm; elif [ -f "$dir/yarn.lock" ]; then runner=yarn; else runner=npm; fi

  for script in lint typecheck test build; do
    if (cd "$dir" && node -e "const p=require('./package.json'); process.exit(p.scripts&&p.scripts['$script']?0:1)"); then
      if [ "$runner" = npm ]; then (cd "$dir" && npm run "$script"); else (cd "$dir" && "$runner" "$script"); fi
    fi
  done
}

if command -v node >/dev/null 2>&1; then
  verify_node_project web
  verify_node_project .
fi

echo "Verification commands completed."
