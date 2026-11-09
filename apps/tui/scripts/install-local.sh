#!/usr/bin/env bash
# Builds the TUI bundle and links it as `t3-tui` into ~/.local/bin. Safe to run again.
set -euo pipefail

tui_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(cd "$tui_dir/../.." && pwd)"
bin_dir="$HOME/.local/bin"
export PATH="$HOME/.local/share/vite-plus/bin:$PATH"

command -v node >/dev/null || { echo "install-local: node is not on PATH" >&2; exit 1; }
command -v vp >/dev/null || { echo "install-local: vp (vite-plus) is not on PATH" >&2; exit 1; }

cd "$repo_dir"
if [ ! -d node_modules ]; then
  echo "Installing dependencies (vp install)"
  vp install
fi
echo "Building $tui_dir/dist/bin.mjs"
vp run --filter @t3tools/tui build >/dev/null

mkdir -p "$bin_dir"
ln -sf "$tui_dir/dist/bin.mjs" "$bin_dir/t3-tui"
echo "Linked $bin_dir/t3-tui -> $tui_dir/dist/bin.mjs"
version="$("$bin_dir/t3-tui" --version)"
echo "t3-tui $version is ready"
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) echo "Add $bin_dir to PATH to run t3-tui by name." ;;
esac
