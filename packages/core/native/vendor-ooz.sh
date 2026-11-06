#!/usr/bin/env bash
# Re-creates ooz/kraken.cpp from upstream powzix/ooz at a pinned commit, truncated after
# Kraken_Decompress (the rest is MSVC-only CLI/DLL code). ooz is GPL-3.0; COPYING holds the license.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
commit=05038060aa68f9187ae9923b2388ca8db40e58d1
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

git clone -q https://github.com/powzix/ooz.git "$work/ooz"
git -C "$work/ooz" checkout -q "$commit"
mkdir -p "$here/ooz"
awk '{ print } /^int Kraken_Decompress\(/ { infn = 1 } infn && /^}/ { exit }' "$work/ooz/kraken.cpp" > "$here/ooz/kraken.cpp"
cp "$work/ooz/README.md" "$here/ooz/README.upstream.md"
curl -fsSL https://www.gnu.org/licenses/gpl-3.0.txt -o "$here/ooz/COPYING"
echo "vendored ooz $commit: $(wc -l < "$here/ooz/kraken.cpp") lines of kraken.cpp"
