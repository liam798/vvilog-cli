#!/usr/bin/env sh
set -eu

REPO_ARCHIVE_URL="${VVILOG_CLI_ARCHIVE_URL:-https://github.com/liam798/vvilog-cli/archive/refs/heads/main.tar.gz}"
PREFIX="${VVILOG_INSTALL_DIR:-$HOME/.local/bin}"
STATE_DIR="${VVILOG_STATE_DIR:-$HOME/.vvilog}"

if ! command -v cargo >/dev/null 2>&1; then
  echo "vvilog install error: missing command 'cargo'" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "vvilog install error: missing command 'curl'" >&2
  exit 1
fi

if ! command -v tar >/dev/null 2>&1; then
  echo "vvilog install error: missing command 'tar'" >&2
  exit 1
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd || pwd)"
SOURCE_DIR="$SCRIPT_DIR"
TMP_DIR=""

if [ ! -f "$SOURCE_DIR/Cargo.toml" ]; then
  TMP_DIR="$(mktemp -d)"
  curl -fsSL "$REPO_ARCHIVE_URL" | tar -xz -C "$TMP_DIR"
  SOURCE_DIR="$(find "$TMP_DIR" -maxdepth 1 -type d -name 'vvilog-cli-*' | head -n 1)"
  if [ -z "$SOURCE_DIR" ] || [ ! -f "$SOURCE_DIR/Cargo.toml" ]; then
    echo "vvilog install error: failed to unpack CLI source" >&2
    exit 1
  fi
fi

cargo build --manifest-path "$SOURCE_DIR/Cargo.toml" --release
mkdir -p "$PREFIX" "$STATE_DIR"
install -m 0755 "$SOURCE_DIR/target/release/vvilog" "$PREFIX/vvilog"

if [ -n "$TMP_DIR" ]; then
  rm -rf "$TMP_DIR"
fi

echo "VviLog CLI installed:"
echo "  binary: $PREFIX/vvilog"
echo "  skills: $STATE_DIR/skills"
echo
echo "If '$PREFIX' is not on PATH, add it to your shell profile:"
echo "  export PATH=\"$PREFIX:\$PATH\""
echo
echo "Try:"
echo "  vvilog --help"
