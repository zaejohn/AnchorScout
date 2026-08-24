$ErrorActionPreference = "Continue"

function Has-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

Write-Host "== Codex + Stellar setup =="

if (Has-Command "codex") {
  Write-Host "[ok] Codex found"
  & codex mcp add stellar_raven --url "https://raven.stellar.buzz/mcp" 2>$null
  Write-Host "Raven configured (or already present). Starting OAuth login..."
  & codex mcp login stellar_raven
} else {
  Write-Warning "Codex CLI not found. Install/update Codex, then rerun this script."
}

$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
$skillRoot = Join-Path $codexHome "skills"
$skillPath = Join-Path $skillRoot "stellar-dev-skill"

if (Has-Command "git") {
  New-Item -ItemType Directory -Force -Path $skillRoot | Out-Null
  if (Test-Path (Join-Path $skillPath ".git")) {
    Write-Host "Updating official Stellar Dev Skill..."
    & git -C $skillPath pull --ff-only
  } elseif (-not (Test-Path $skillPath)) {
    Write-Host "Installing official Stellar Dev Skill..."
    & git clone https://github.com/stellar/stellar-dev-skill $skillPath
  } else {
    Write-Warning "$skillPath exists but is not a git clone; leaving it unchanged."
  }
} else {
  Write-Warning "git not found; could not install official Stellar Dev Skill."
}

if (Has-Command "rustup") {
  Write-Host "Installing/updating Stellar Wasm Rust target..."
  & rustup target add wasm32v1-none
} else {
  Write-Warning "rustup not found. Install Rust >= 1.84 before contract development."
}

$checks = @("stellar", "rustc", "cargo", "docker", "node", "git")
foreach ($tool in $checks) {
  if (Has-Command $tool) { Write-Host "[ok] $tool" } else { Write-Warning "[missing] $tool" }
}

Write-Host "Setup finished. See docs/FIRST-RUN.md."
