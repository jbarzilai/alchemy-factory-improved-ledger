# Contributing

## Development setup

Development happens in Linux/WSL with Node.js ≥ 22, npm and `build-essential`. If
`g++-mingw-w64-x86-64` is installed, `npm run build:native` also builds the Windows `kdec.exe`;
without it, only the Linux `kdec` is built and the committed `kdec.exe` is kept. After changing the
native source, rebuild with mingw and commit `kdec.exe`.

From the repository root:

```sh
npm ci
npm run build:native
npm run build
npm run bootstrap
npm link -w @af-ledger/cli
af-ledger doctor
```

A Windows clone can run the CLI and `npm run web` in PowerShell with Node.js ≥ 22. `kdec.exe` is
committed, so skip `npm run build:native` there. Windows packaging is not built yet.

See the [README](README.md#configuration) for `.env` settings and [docs/](docs/) for the save-format
notes and the web app's design rules.

## Tests

Run `npm test` and `npm run typecheck`.

The golden tests use the author's save `fixtures/saves/SaveGame3.sav` (committed; SHA-256 pinned in
`fixtures/save-fixture.json`; never modify it) and check it against numbers transcribed from the
in-game ledger. Inside WSL, `npm test` also checks that the committed `kdec.exe` decodes exactly like
the Linux `kdec`; `AF_SKIP_WIN=1` skips that check. With mingw installed, it also checks that
`kdec.exe` equals a fresh build of the source.
