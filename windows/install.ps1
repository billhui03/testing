# Install a per-user autostart entry that launches the Claude desktop app at login.
# Usage: .\install.ps1 [-AppPath "C:\path\to\claude.exe"]
param(
    [string]$AppPath = "$env:LOCALAPPDATA\AnthropicClaude\claude.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $AppPath)) {
    Write-Error "Claude app not found at $AppPath. Pass the path with -AppPath."
}

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
Set-ItemProperty -Path $runKey -Name "Claude" -Value "`"$AppPath`""

Write-Host "Installed: Claude will start automatically at login."
Write-Host "Registry entry: $runKey\Claude -> $AppPath"
