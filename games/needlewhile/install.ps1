param(
  [ValidateSet("all", "codex", "claude")]
  [string]$Target = "all"
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $RootDir "../.."))
$RootInstaller = Join-Path $RepoRoot "install.ps1"
$RootMarketplace = Join-Path $RepoRoot ".agents/plugins/marketplace.json"

# Use the repository installer when this package has not been separated from
# Jieya. A copied standalone package continues with the local implementation.
if (([System.IO.Path]::GetFullPath($RootDir) -eq [System.IO.Path]::GetFullPath((Join-Path $RepoRoot "games/needlewhile"))) -and
    (Test-Path -LiteralPath $RootInstaller -PathType Leaf) -and
    (Test-Path -LiteralPath $RootMarketplace -PathType Leaf)) {
  & $RootInstaller -Target $Target
  exit $LASTEXITCODE
}

$CodexMarketplaceDir = $RootDir
$CodexMarketplaceName = "jieya"
$CodexPluginId = "needlewhile@jieya"
$CodexLegacyPluginId = "needlewhile@needlewhile-local"
$CodexGitSource = "https://github.com/magicfanshanghai-sys/jieya.git"
$CodexDoctor = Join-Path $RootDir "scripts/codex-hook-doctor.mjs"
$CodexManifest = Join-Path $RootDir ".codex-plugin/plugin.json"
$Installed = $false
$CodexPending = $false
$DoctorExitCode = 0

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Needlewhile requires Node.js 18 or newer."
}

$NodeVersion = (& node -p "process.versions.node").Trim()
if ($LASTEXITCODE -ne 0 -or $NodeVersion -notmatch '^(\d+)\.') {
  throw "Could not determine the installed Node.js version."
}
$NodeMajor = [int]$Matches[1]
if ($NodeMajor -lt 18) {
  throw "Needlewhile requires Node.js 18 or newer; found v$NodeVersion."
}

try {
  $ExpectedCodexVersion = [string]((Get-Content -LiteralPath $CodexManifest -Raw | ConvertFrom-Json).version)
}
catch {
  throw "Could not read the expected Needlewhile version from $CodexManifest."
}
if ([string]::IsNullOrWhiteSpace($ExpectedCodexVersion)) {
  throw "The Needlewhile Codex manifest does not contain a version."
}

node (Join-Path $RootDir "scripts/validate.mjs")
if ($LASTEXITCODE -ne 0) {
  throw "Needlewhile package validation failed."
}

function Invoke-CodexJson {
  param([string[]]$Arguments)

  $Raw = & codex @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Codex command failed: codex $($Arguments -join ' ')"
  }
  try {
    return (($Raw -join [Environment]::NewLine) | ConvertFrom-Json)
  }
  catch {
    throw "Codex returned invalid JSON for: codex $($Arguments -join ' ')"
  }
}

function Get-NormalizedLocalPath {
  param([string]$Path)

  if (Test-Path -LiteralPath $Path) {
    return (Resolve-Path -LiteralPath $Path).Path.TrimEnd([char[]]@('\', '/'))
  }
  return [System.IO.Path]::GetFullPath($Path).TrimEnd([char[]]@('\', '/'))
}

function Test-SameLocalPath {
  param([string]$Left, [string]$Right)

  $Comparison = if ($env:OS -eq "Windows_NT") {
    [StringComparison]::OrdinalIgnoreCase
  }
  else {
    [StringComparison]::Ordinal
  }
  return [string]::Equals(
    (Get-NormalizedLocalPath $Left),
    (Get-NormalizedLocalPath $Right),
    $Comparison
  )
}

function Get-NormalizedGitSource {
  param([string]$Source)

  $Value = $Source.Trim().Replace('\', '/').ToLowerInvariant()
  $Value = $Value -replace '^git@github\.com:', 'https://github.com/'
  $Value = $Value -replace '^ssh://git@github\.com/', 'https://github.com/'
  if ($Value -match '^[^/:]+/[^/]+$') {
    $Value = "https://github.com/$Value"
  }
  return ($Value -replace '\.git$', '').TrimEnd('/')
}

function Test-SameGitSource {
  param([string]$Left, [string]$Right)

  return (Get-NormalizedGitSource $Left) -eq (Get-NormalizedGitSource $Right)
}

function Initialize-CodexMarketplace {
  $Marketplaces = Invoke-CodexJson @("plugin", "marketplace", "list", "--json")
  $Existing = @($Marketplaces.marketplaces | Where-Object { $_.name -eq $CodexMarketplaceName }) | Select-Object -First 1

  if ($null -eq $Existing) {
    $null = & codex plugin marketplace add $CodexMarketplaceDir --json
    if ($LASTEXITCODE -ne 0) {
      throw "Could not register the local Jieya marketplace at $CodexMarketplaceDir."
    }
    Write-Host "Registered the local Jieya marketplace."
    return
  }

  $MarketplaceType = [string]$Existing.marketplaceSource.sourceType
  $MarketplaceSource = [string]$Existing.marketplaceSource.source
  if ([string]::IsNullOrWhiteSpace($MarketplaceType) -and -not [string]::IsNullOrWhiteSpace([string]$Existing.root)) {
    $MarketplaceType = "local"
    $MarketplaceSource = [string]$Existing.root
  }

  switch ($MarketplaceType.ToLowerInvariant()) {
    "git" {
      if (-not (Test-SameGitSource $MarketplaceSource $CodexGitSource)) {
        throw "Codex marketplace 'jieya' points to a different Git source.`nExpected: $CodexGitSource"
      }
      $null = & codex plugin marketplace upgrade $CodexMarketplaceName --json
      if ($LASTEXITCODE -ne 0) {
        throw "Could not refresh the configured Jieya Git marketplace."
      }
      Write-Host "Refreshed the configured Jieya Git marketplace."
    }
    "local" {
      if (-not (Test-SameLocalPath $MarketplaceSource $CodexMarketplaceDir)) {
        throw "Codex marketplace 'jieya' points to another local directory.`nRemove or rename the conflicting marketplace before installing Needlewhile."
      }
      Write-Host "Reusing the configured local Jieya marketplace."
    }
    default {
      $DisplayType = if ([string]::IsNullOrWhiteSpace($MarketplaceType)) { "unknown" } else { $MarketplaceType }
      throw "Codex marketplace 'jieya' uses an unsupported source type: $DisplayType"
    }
  }
}

function Get-CodexNeedlewhilePlugin {
  param([switch]$IncludeAvailable)

  $Arguments = @("plugin", "list", "--json")
  if ($IncludeAvailable) {
    $Arguments = @("plugin", "list", "--available", "--json")
  }
  $Plugins = Invoke-CodexJson $Arguments
  return @($Plugins.installed | Where-Object { $_.pluginId -eq $CodexPluginId }) | Select-Object -First 1
}

function Get-CodexLegacyNeedlewhilePlugin {
  param([switch]$IncludeAvailable)

  $Arguments = @("plugin", "list", "--json")
  if ($IncludeAvailable) {
    $Arguments = @("plugin", "list", "--available", "--json")
  }
  $Plugins = Invoke-CodexJson $Arguments
  return @($Plugins.installed | Where-Object { $_.pluginId -eq $CodexLegacyPluginId }) | Select-Object -First 1
}

function Enable-CodexNeedlewhilePlugin {
  $LegacyPlugin = Get-CodexLegacyNeedlewhilePlugin -IncludeAvailable
  if ($null -ne $LegacyPlugin) {
    $null = & codex plugin remove $CodexLegacyPluginId --json
    if ($LASTEXITCODE -ne 0) {
      throw "Could not remove the legacy Needlewhile plugin identity. Run: codex plugin remove $CodexLegacyPluginId"
    }
    Write-Host "Removed the legacy Needlewhile plugin identity."
  }

  $Plugin = Get-CodexNeedlewhilePlugin -IncludeAvailable
  if ($null -eq $Plugin) {
    $null = & codex plugin add $CodexPluginId --json
    if ($LASTEXITCODE -ne 0) {
      throw "Could not install $CodexPluginId."
    }
    Write-Host "Registered and enabled the Needlewhile Codex plugin."
  }
  elseif (-not [bool]$Plugin.enabled) {
    $null = & codex plugin add $CodexPluginId --json
    if ($LASTEXITCODE -ne 0) {
      throw "Needlewhile is installed but Codex could not enable it."
    }
    Write-Host "Re-enabled the installed Needlewhile Codex plugin."
  }
  else {
    $null = & codex plugin add $CodexPluginId --json
    if ($LASTEXITCODE -ne 0) {
      throw "Could not synchronize the installed Needlewhile Codex plugin."
    }
    Write-Host "Synchronized the installed and enabled Needlewhile Codex plugin."
  }

  $Verified = Get-CodexNeedlewhilePlugin
  if ($null -eq $Verified -or -not [bool]$Verified.enabled) {
    throw "Needlewhile did not reach the installed-and-enabled state."
  }
  if ($null -ne (Get-CodexLegacyNeedlewhilePlugin)) {
    throw "The legacy Needlewhile plugin identity is still installed."
  }
  $ActualVersion = [string]$Verified.version
  if ($ActualVersion -ne $ExpectedCodexVersion) {
    $DisplayVersion = if ([string]::IsNullOrWhiteSpace($ActualVersion)) { "unknown" } else { $ActualVersion }
    throw "Needlewhile version mismatch: expected $ExpectedCodexVersion, found $DisplayVersion. The configured marketplace may be pinned to an older ref; update it and run this installer again."
  }
}

function Test-InteractiveTerminal {
  if ($env:CI -match '^(?i:1|true|yes)$') {
    return $false
  }
  try {
    return [Environment]::UserInteractive -and -not [Console]::IsInputRedirected -and -not [Console]::IsOutputRedirected
  }
  catch {
    return $false
  }
}

function Open-CodexNeedlewhileDetails {
  if ($env:OS -eq "Windows_NT") {
    try {
      Start-Process 'codex://plugins/needlewhile@jieya'
    }
    catch {
      Write-Warning "Could not open Codex automatically. Open the Needlewhile plugin details manually."
    }
    return
  }

  if ((Get-Command open -ErrorAction SilentlyContinue) -and ((& uname -s) -eq "Darwin")) {
    & open 'codex://plugins/needlewhile@jieya'
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Could not open Codex automatically. Open the Needlewhile plugin details manually."
    }
    return
  }

  Write-Warning "Open the Needlewhile plugin details in Codex."
}

function Invoke-CodexHookDoctor {
  if (-not (Test-Path -LiteralPath $CodexDoctor -PathType Leaf)) {
    Write-Error "Needlewhile Hook doctor is missing: $CodexDoctor" -ErrorAction Continue
    $script:DoctorExitCode = 3
    return
  }
  & node $CodexDoctor --cwd $RootDir
  $script:DoctorExitCode = $LASTEXITCODE
}

function Confirm-CodexHooks {
  Invoke-CodexHookDoctor
  if ($DoctorExitCode -eq 0) {
    Write-Host "Needlewhile is ready for Codex: the plugin is enabled and all three Hooks are trusted."
    return
  }
  if ($DoctorExitCode -ne 2) {
    throw "Needlewhile Hook verification failed (doctor exit $DoctorExitCode)."
  }

  Write-Warning "Needlewhile authorization is pending: review its three Hook commands and choose 'Trust all' in Codex."
  if (Test-InteractiveTerminal) {
    Open-CodexNeedlewhileDetails
    $null = Read-Host "After choosing 'Trust all' in Codex, press Enter here to verify again"
    Invoke-CodexHookDoctor
    if ($DoctorExitCode -eq 0) {
      Write-Host "Needlewhile is ready for Codex: the plugin is enabled and all three Hooks are trusted."
      return
    }
    if ($DoctorExitCode -ne 2) {
      throw "Needlewhile Hook verification failed after review (doctor exit $DoctorExitCode)."
    }
  }

  $script:CodexPending = $true
  Write-Warning "NEEDLEWHILE_STATUS=pending"
  Write-Warning "Run this installer again after trusting all three Hooks; no trust settings were changed automatically."
}

function Install-CodexNeedlewhile {
  if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    Write-Warning "Codex CLI was not found; skipped Codex installation."
    return
  }
  Initialize-CodexMarketplace
  Enable-CodexNeedlewhilePlugin
  $script:Installed = $true
  Confirm-CodexHooks
}

function Install-ClaudeNeedlewhile {
  if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Warning "Claude Code was not found; skipped Claude Code installation."
    return
  }
  claude plugin validate $RootDir
  if ($LASTEXITCODE -ne 0) { throw "Claude Code plugin validation failed." }
  claude plugin marketplace add $RootDir
  if ($LASTEXITCODE -ne 0) { throw "Claude Code marketplace registration failed." }
  claude plugin install needlewhile@needlewhile-local
  if ($LASTEXITCODE -ne 0) { throw "Claude Code plugin installation failed." }
  $script:Installed = $true
  Write-Host "Claude Code installed. Restart it before the first automatic round."
}

if ($Target -eq "all" -or $Target -eq "codex") { Install-CodexNeedlewhile }
if ($Target -eq "all" -or $Target -eq "claude") { Install-ClaudeNeedlewhile }

if (-not $Installed) {
  throw "No supported local CLI was found."
}

if ($CodexPending) {
  exit 2
}
