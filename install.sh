#!/usr/bin/env sh
set -eu

SPEC="${VVILOG_INSTALL_SPEC:-git+https://github.com/liam798/vvilog-cli.git}"

if ! command -v node >/dev/null 2>&1; then
  echo "vvilog install error: missing command 'node' (requires Node.js 18+)" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "vvilog install error: missing command 'npm'" >&2
  exit 1
fi

echo "Installing VviLog CLI from $SPEC..."
npm install -g --force "$SPEC"

echo
echo "VviLog CLI installed."
echo
echo "Try:"
echo "  vvilog --help"
echo "  vvilog init"
