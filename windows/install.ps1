# Install a per-user autostart entry that launches the Claude desktop app at login.
# Auto-detects the install location; pass -AppPath only if detection fails.
# Usage: .\install.ps1 [-AppPath "C:\path\to\claude.exe"]
param(
    [string]$AppPath
)

$ErrorActionPreference = "Stop"

function Find-ClaudeExe {
    $roots = @(
        "$env:LOCALAPPDATA\AnthropicClaude",
        "$env:LOCALAPPDATA\Programs\Claude",
        "$env:LOCALAPPDATA\Programs\AnthropicClaude",
        "$env:ProgramFiles\Claude",
        "$env:ProgramFiles\AnthropicClaude"
    )
    foreach ($root in $roots) {
        if (Test-Path $root) {
            $exe = Get-ChildItem $root -Recurse -Filter "claude.exe" -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($exe) { return $exe.FullName }
        }
    }

    # Fall back to the Start Menu shortcut's target
    $shell = New-Object -ComObject WScript.Shell
    $menus = @(
        "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
        "$env:ProgramData\Microsoft\Windows\Start Menu\Programs"
    )
    foreach ($menu in $menus) {
        $links = Get-ChildItem $menu -Recurse -Filter "*Claude*.lnk" -ErrorAction SilentlyContinue
        foreach ($link in $links) {
            $target = $shell.CreateShortcut($link.FullName).TargetPath
            if ($target -and (Test-Path $target) -and $target -like "*.exe") { return $target }
        }
    }
    return $null
}

if (-not $AppPath) {
    $AppPath = Find-ClaudeExe
    if (-not $AppPath) {
        Write-Error ("Could not find the Claude desktop app. If it was installed from the " +
            "Microsoft Store, enable it in Settings > Apps > Startup instead. Otherwise pass " +
            "the exe location with -AppPath `"C:\path\to\claude.exe`".")
    }
    Write-Host "Detected Claude at: $AppPath"
} elseif (-not (Test-Path $AppPath)) {
    Write-Error "Claude app not found at $AppPath."
}

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
Set-ItemProperty -Path $runKey -Name "Claude" -Value "`"$AppPath`""

Write-Host "Installed: Claude will start automatically at login."
Write-Host "Registry entry: $runKey\Claude -> $AppPath"
