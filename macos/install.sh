#!/usr/bin/env bash
# Install a launchd Launch Agent that starts the Claude desktop app at login.
# Usage: ./install.sh [/path/to/Claude.app]
set -euo pipefail

APP_PATH="${1:-/Applications/Claude.app}"
LABEL="com.anthropic.claude.autostart"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ ! -d "$APP_PATH" ]; then
  echo "error: Claude app not found at $APP_PATH" >&2
  echo "Pass the app path as the first argument, e.g. ./install.sh \"/Applications/Claude.app\"" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-a</string>
    <string>$APP_PATH</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "Installed: Claude will start automatically at login."
echo "Plist: $PLIST"
