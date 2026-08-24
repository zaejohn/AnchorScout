$ErrorActionPreference = "Stop"

if (Test-Path "web") {
  throw "web/ already exists. Refusing to overwrite it."
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw "pnpm was not found. Install pnpm, then rerun this script."
}

Write-Host "Scaffolding current stable Next.js App Router application in web/..."
& pnpm create next-app@latest web --typescript --tailwind --eslint --app --src-dir --use-pnpm --import-alias "@/*" --disable-git --yes
if ($LASTEXITCODE -ne 0) { throw "create-next-app failed." }

$customRules = Get-Content "templates/web-AGENTS.md" -Raw
if (Test-Path "web/AGENTS.md") {
  Add-Content "web/AGENTS.md" "`n`n---`n`n$customRules"
  Write-Host "[ok] Preserved create-next-app AGENTS.md and appended Stellar/full-stack rules"
} else {
  Copy-Item "templates/web-AGENTS.md" "web/AGENTS.md" -Force
  Write-Host "[ok] Installed Stellar/full-stack rules at web/AGENTS.md"
}

Copy-Item "templates/web-.env.example" "web/.env.example" -Force

Write-Host "[ok] Next.js scaffold created in web/"
Write-Host "Next: run pnpm --dir web dev or continue with docs/FIRST-RUN.md."
