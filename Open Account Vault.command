#!/bin/bash
# Double-click this file to open the Account Vault control panel.
# (Right-click it once and choose "Open" the very first time, if macOS warns about
# an unidentified developer — that's normal for a script you made yourself.)

cd "$(dirname "$0")" || exit 1

echo ""
echo "Account Vault"
echo "-------------"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed yet."
  echo "Install it from https://nodejs.org (choose the LTS version), restart your Mac if it"
  echo "asks you to, then double-click this file again."
  echo ""
  read -n 1 -s -r -p "Press any key to close this window..."
  echo ""
  exit 1
fi

if [ ! -d "node_modules" ] || [ ! -d "dist" ]; then
  echo "Setting up for the first time — this can take a minute..."
  npm install
  npm run build
  echo ""
fi

echo "Starting... a page will open in your browser automatically in a moment."
echo "You can close this window once it opens, or just leave it running in the background."
echo ""
npm run panel
