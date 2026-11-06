# Vendored ooz

- `kraken.cpp`: from https://github.com/powzix/ooz at commit 05038060aa68f9187ae9923b2388ca8db40e58d1,
  truncated after `Kraken_Decompress` by `../vendor-ooz.sh`. Copyright (C) 2016 Powzix, GPL-3.0 (see `COPYING`).
- `stdafx.h`: **ours**, a portable replacement for upstream's MSVC-only header (same license as kraken.cpp).
- `README.upstream.md`: upstream README, unchanged.

`kdec` links this code and is distributed as a separate executable; the TypeScript code only spawns it.
