# Remove the Claude autostart entry.
$ErrorActionPreference = "Stop"

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"

if (Get-ItemProperty -Path $runKey -Name "Claude" -ErrorAction SilentlyContinue) {
    Remove-ItemProperty -Path $runKey -Name "Claude"
    Write-Host "Removed: Claude will no longer start at login."
} else {
    Write-Host "Nothing to remove: no Claude autostart entry found."
}
