# Claude Autostart Setup

Scripts to make the Claude desktop app (or a Claude Code session in your terminal)
start automatically when you log in to your laptop.

Pick the folder for your operating system and run the install script. Each script
is idempotent — running it again just refreshes the existing autostart entry —
and each folder includes an `uninstall` script to undo it.

## macOS

Uses a `launchd` Launch Agent (`~/Library/LaunchAgents`).

```bash
cd macos
./install.sh          # autostart the Claude desktop app at login
./uninstall.sh        # remove the autostart entry
```

## Windows

Uses the current user's registry `Run` key (no admin rights needed).
Run from PowerShell:

```powershell
cd windows
.\install.ps1         # autostart the Claude desktop app at login
.\uninstall.ps1       # remove the autostart entry
```

## Linux

Uses an XDG autostart entry (`~/.config/autostart`), which works on GNOME,
KDE, XFCE, and most other desktop environments.

```bash
cd linux
./install.sh          # autostart the Claude desktop app at login
./uninstall.sh        # remove the autostart entry
```

## Notes

- The scripts autostart the **Claude desktop app**. If you instead want a
  terminal with **Claude Code** to open at login, edit the command in the
  installed entry to your terminal emulator, e.g.
  `open -a Terminal` + `claude` on macOS, or `gnome-terminal -- claude` on Linux.
- If Claude is installed in a non-default location, pass the path as the first
  argument to the install script.
