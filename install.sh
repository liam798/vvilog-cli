#!/usr/bin/env sh
set -eu

VERSION="${VVILOG_CLI_VERSION:-v0.1.0}"
BASE_URL="${VVILOG_CLI_BASE_URL:-https://github.com/liam798/vvilog-cli/releases/download/$VERSION}"
PREFIX="${VVILOG_INSTALL_DIR:-$HOME/.local/bin}"
STATE_DIR="${VVILOG_STATE_DIR:-$HOME/.vvilog}"

if ! command -v curl >/dev/null 2>&1; then
  echo "vvilog install error: missing command 'curl'" >&2
  exit 1
fi

case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  *)
    echo "vvilog install error: unsupported OS $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64 | aarch64) arch="arm64" ;;
  x86_64 | amd64) arch="amd64" ;;
  *)
    echo "vvilog install error: unsupported arch $(uname -m)" >&2
    exit 1
    ;;
esac

asset="vvilog-${os}-${arch}"
url="${BASE_URL}/${asset}"
tmp="${TMPDIR:-/tmp}/vvilog-install-$$"

cleanup() {
  rm -f "$tmp"
}
trap cleanup EXIT INT TERM

echo "Downloading VviLog CLI from $url..."
curl -fsSL "$url" -o "$tmp"
chmod 0755 "$tmp"

mkdir -p "$PREFIX" "$STATE_DIR"
mv "$tmp" "$PREFIX/vvilog"

echo "VviLog CLI installed:"
echo "  binary: $PREFIX/vvilog"
echo "  skills: $STATE_DIR/skills"
echo
echo "If '$PREFIX' is not on PATH, add it to your shell profile:"
echo "  export PATH=\"$PREFIX:\$PATH\""
echo
echo "Try:"
echo "  vvilog --help"
