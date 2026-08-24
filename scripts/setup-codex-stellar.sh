#!/usr/bin/env bash
set -u

echo "== Codex + Stellar setup =="

has() { command -v "$1" >/dev/null 2>&1; }

if has codex; then
  echo "[ok] Codex found"
  codex mcp add stellar_raven --url "https://raven.stellar.buzz/mcp" >/dev/null 2>&1 || true
  echo "Raven configured (or already present). Starting OAuth login..."
  codex mcp login stellar_raven || true
else
  echo "[missing] Codex CLI"
fi

CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
SKILL_ROOT="$CODEX_DIR/skills"
SKILL_PATH="$SKILL_ROOT/stellar-dev-skill"

if has git; then
  mkdir -p "$SKILL_ROOT"
  if [ -d "$SKILL_PATH/.git" ]; then
    git -C "$SKILL_PATH" pull --ff-only || true
  elif [ ! -e "$SKILL_PATH" ]; then
    git clone https://github.com/stellar/stellar-dev-skill "$SKILL_PATH" || true
  else
    echo "[warn] $SKILL_PATH exists but is not a git clone; unchanged"
  fi
fi

if has rustup; then
  rustup target add wasm32v1-none || true
else
  echo "[missing] rustup (Rust >= 1.84 required for modern Soroban contracts)"
fi

for tool in stellar rustc cargo docker node git; do
  if has "$tool"; then echo "[ok] $tool"; else echo "[missing] $tool"; fi
done

echo "Setup finished. See docs/FIRST-RUN.md."
