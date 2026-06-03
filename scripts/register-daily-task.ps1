param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$TaskName = "Weekly GitHub Stars Skills MCP Daily Update",
  [string]$At = "08:30"
)

$ErrorActionPreference = "Stop"

$updateScript = Join-Path $ProjectRoot "scripts\update-stars.ps1"
if (-not (Test-Path $updateScript)) {
  throw "Update script not found: $updateScript"
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$updateScript`" -ProjectRoot `"$ProjectRoot`""

$trigger = New-ScheduledTaskTrigger -Daily -At $At

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Description "Update daily and weekly GitHub stars reports for Skills and MCP repositories." `
  -Force | Out-Null

Write-Host "Registered scheduled task: $TaskName at $At"
