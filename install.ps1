param(
  [ValidateSet("all", "codex", "claude")]
  [string]$Target = "all"
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$GameDir = Join-Path $RootDir "games/needlewhile"
$Installed = $false

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Jieya requires Node.js 18 or newer."
}

node (Join-Path $RootDir "scripts/validate.mjs")
if ($LASTEXITCODE -ne 0) {
  throw "Jieya validation failed."
}

function Install-CodexNeedlewhile {
  if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    Write-Warning "Codex CLI was not found; skipped Codex installation."
    return
  }
  codex plugin marketplace add $RootDir
  if ($LASTEXITCODE -ne 0) { throw "Codex marketplace registration failed." }
  codex plugin add needlewhile@jieya
  if ($LASTEXITCODE -ne 0) { throw "Codex plugin installation failed." }
  $script:Installed = $true
  Write-Host "Needlewhile installed for Codex. Restart Codex, inspect /hooks, and trust its commands."
}

function Install-ClaudeNeedlewhile {
  if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Warning "Claude Code was not found; skipped Claude Code installation."
    return
  }
  claude plugin validate $GameDir
  if ($LASTEXITCODE -ne 0) { throw "Claude Code plugin validation failed." }
  claude plugin marketplace add $RootDir
  if ($LASTEXITCODE -ne 0) { throw "Claude Code marketplace registration failed." }
  claude plugin install needlewhile@jieya
  if ($LASTEXITCODE -ne 0) { throw "Claude Code plugin installation failed." }
  $script:Installed = $true
  Write-Host "Needlewhile installed for Claude Code. Restart it before the first automatic round."
}

if ($Target -eq "all" -or $Target -eq "codex") { Install-CodexNeedlewhile }
if ($Target -eq "all" -or $Target -eq "claude") { Install-ClaudeNeedlewhile }

if (-not $Installed) {
  throw "No supported local CLI was found."
}
