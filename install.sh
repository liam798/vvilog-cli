#!/usr/bin/env sh
set -eu

VERSION="${VVILOG_CLI_VERSION:-latest}"
if [ "$VERSION" = "latest" ]; then
  DEFAULT_BASE_URL="https://github.com/liam798/vvilog-cli/releases/latest/download"
else
  DEFAULT_BASE_URL="https://github.com/liam798/vvilog-cli/releases/download/$VERSION"
fi
BASE_URL="${VVILOG_CLI_BASE_URL:-$DEFAULT_BASE_URL}"
PREFIX="${VVILOG_INSTALL_DIR:-$HOME/.local/bin}"
STATE_DIR="${VVILOG_STATE_DIR:-$HOME/.vvilog}"

if ! command -v curl >/dev/null 2>&1; then
  echo "vvilog install error: missing command 'curl'" >&2
  exit 1
fi

case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  MINGW* | MSYS* | CYGWIN* | Windows_NT) os="windows" ;;
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
binary_name="vvilog"
if [ "$os" = "windows" ]; then
  asset="${asset}.exe"
  binary_name="vvilog.exe"
fi
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
mv "$tmp" "$PREFIX/$binary_name"

echo "VviLog CLI installed:"
echo "  binary: $PREFIX/$binary_name"
echo "  skills: $STATE_DIR/skills"
echo
echo "If '$PREFIX' is not on PATH, add it to your shell profile:"
echo "  export PATH=\"$PREFIX:\$PATH\""
echo
echo "Try:"
echo "  vvilog --help"
