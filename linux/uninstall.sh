#!/usr/bin/env bash
# Remove the Claude XDG autostart entry.
set -euo pipefail

DESKTOP_FILE="$HOME/.config/autostart/claude.desktop"

if [ -f "$DESKTOP_FILE" ]; then
  rm -f "$DESKTOP_FILE"
  echo "Removed: Claude will no longer start at login."
else
  echo "Nothing to remove: $DESKTOP_FILE not found."
fi
