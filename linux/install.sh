#!/usr/bin/env bash
# Install an XDG autostart entry that launches the Claude desktop app at login.
# Works on GNOME, KDE, XFCE, and most other desktop environments.
# Usage: ./install.sh [claude-command]
set -euo pipefail

CLAUDE_CMD="${1:-claude-desktop}"

if ! command -v "${CLAUDE_CMD%% *}" >/dev/null 2>&1; then
  echo "error: '$CLAUDE_CMD' not found on PATH" >&2
  echo "Pass the launch command as the first argument, e.g. ./install.sh /opt/claude/claude" >&2
  exit 1
fi

AUTOSTART_DIR="$HOME/.config/autostart"
DESKTOP_FILE="$AUTOSTART_DIR/claude.desktop"

mkdir -p "$AUTOSTART_DIR"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Claude
Comment=Start Claude at login
Exec=$CLAUDE_CMD
Terminal=false
X-GNOME-Autostart-enabled=true
EOF

echo "Installed: Claude will start automatically at login."
echo "Entry: $DESKTOP_FILE"
