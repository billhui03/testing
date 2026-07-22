# Autostart for the Microsoft Store (MSIX) version of the Claude desktop app.
# Store apps have no stable exe path, so this creates a Startup-folder shortcut
# that launches the app by its application ID.
$ErrorActionPreference = "Stop"

$apps = @(Get-StartApps | Where-Object { $_.Name -eq "Claude" })
if (-not $apps) {
    $apps = @(Get-StartApps | Where-Object { $_.Name -like "*Claude*" -and $_.Name -notlike "*Code*" })
}
if (-not $apps) {
    Write-Error "No installed app named Claude found. Is the Claude desktop app installed?"
}
$aumid = $apps[0].AppID

$shortcut = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Claude.lnk"
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
$link.TargetPath = "$env:windir\explorer.exe"
$link.Arguments = "shell:AppsFolder\$aumid"
$link.Save()

Write-Host "Installed: Claude ($aumid) will start automatically at login."
Write-Host "Shortcut: $shortcut"
Write-Host "To undo, delete that shortcut or run .\uninstall-store.ps1"
