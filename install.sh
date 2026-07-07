#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
PREFIX="${VVILOG_INSTALL_DIR:-$HOME/.local/bin}"
STATE_DIR="${VVILOG_STATE_DIR:-$HOME/.vvilog}"

if ! command -v cargo >/dev/null 2>&1; then
  echo "vvilog install error: missing command 'cargo'" >&2
  exit 1
fi

cargo build --manifest-path "$SCRIPT_DIR/Cargo.toml" --release
mkdir -p "$PREFIX" "$STATE_DIR"
install -m 0755 "$SCRIPT_DIR/target/release/vvilog" "$PREFIX/vvilog"

rm -rf "$STATE_DIR/skills"
if [ -d "$ROOT_DIR/skills" ]; then
  mkdir -p "$STATE_DIR/skills"
  (cd "$ROOT_DIR/skills" && tar cf - .) | (cd "$STATE_DIR/skills" && tar xf -)
fi

echo "Installed $PREFIX/vvilog"
