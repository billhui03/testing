#!/usr/bin/env bash
# Remove the Claude autostart Launch Agent.
set -euo pipefail

LABEL="com.anthropic.claude.autostart"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ -f "$PLIST" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Removed: Claude will no longer start at login."
else
  echo "Nothing to remove: $PLIST not found."
fi
