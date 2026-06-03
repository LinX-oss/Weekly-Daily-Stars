param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

Set-Location $ProjectRoot

if (-not $env:GITHUB_TOKEN) {
  Write-Warning "GITHUB_TOKEN is not set. Daily stars may be rate-limited by GitHub API."
}

npm run update
