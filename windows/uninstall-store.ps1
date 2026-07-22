# Remove the Startup-folder shortcut created by install-store.ps1.
$ErrorActionPreference = "Stop"

$shortcut = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Claude.lnk"

if (Test-Path $shortcut) {
    Remove-Item $shortcut
    Write-Host "Removed: Claude will no longer start at login."
} else {
    Write-Host "Nothing to remove: $shortcut not found."
}
