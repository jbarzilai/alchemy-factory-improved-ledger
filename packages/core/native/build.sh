#!/usr/bin/env bash
# Builds kdec for Linux (WSL dev/tests, git-ignored) and Windows (mingw cross-compile, committed so a Windows clone
# needs no compiler) into native/bin/, or into the folder given as $1.
# mingw is optional: without it only the Linux kdec is built, which is all the CLI and website need on Linux, and the
# committed kdec.exe is left as it is.
# The Windows build is reproducible: sources are passed relative to this folder (kraken.cpp's __FILE__ would otherwise
# embed the build machine's path) and the PE timestamp is left out, so rebuilding unchanged source leaves git clean.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="${1:-$here/bin}"
src=(kdec.cpp stubs.cpp ooz/kraken.cpp)
flags=(-O2 -msse4.1 -w -fpermissive)

need() {
  command -v "$1" > /dev/null || { echo "build:native: $1 not found. Install: sudo apt-get install -y $2" >&2; exit 1; }
}
need g++ build-essential

mkdir -p "$out/linux-x64"
out="$(cd "$out" && pwd)"
cd "$here"
g++ "${flags[@]}" -o "$out/linux-x64/kdec" "${src[@]}"
if command -v x86_64-w64-mingw32-g++ > /dev/null; then
  mkdir -p "$out/win32-x64"
  x86_64-w64-mingw32-g++ "${flags[@]}" -static -Wl,--no-insert-timestamp -o "$out/win32-x64/kdec.exe" "${src[@]}"
  echo "built $out/linux-x64/kdec and $out/win32-x64/kdec.exe"
else
  echo "built $out/linux-x64/kdec; skipped kdec.exe (install g++-mingw-w64-x86-64 to build it)"
  if [ -f "$out/win32-x64/kdec.exe" ]; then
    echo "kept the existing kdec.exe; after changing the native source, rebuild it with mingw and commit it"
  fi
fi
