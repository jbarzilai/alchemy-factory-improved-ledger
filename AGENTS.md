# af-ledger: notes for coding agents and contributors

- Layout: `docs/` holds the save-format notes (`SAVE_FORMAT.md`) and the web app's design rules (`DESIGN.md`).
  Code, config, fixtures and scripts live at the repo root.
- This file is the single source of agent instructions for this repo; `CLAUDE.md` only imports it (`@AGENTS.md`).
- **Save files are strictly read-only.** Never open a `.sav` for writing, never write/rename/create
  anything inside the saves folder (`%LOCALAPPDATA%\AlchemyFactory\Saved\SaveGames\...`, seen from
  WSL as `/mnt/c/Users/<user>/AppData/Local/AlchemyFactory/Saved/SaveGames/...`).
  Work on in-memory buffers; caches go in this repo's `.cache/`.
- **Cap memory for one-off scripts over saves or game files**, e.g. `(ulimit -v 4000000; python3 -I script.py ...)`.
  A misread length field can make a parser allocate without bound, and an out-of-memory kill in WSL can end every
  terminal session. `timeout` limits time, not memory.
- **Linux/WSL first (decision 2026-10-25).** Repo and tools run in WSL with the Linux `kdec`, reading saves
  through `/mnt/c/...`. Windows packaging (`package:win`/`test:win`) is not built yet.
  Keep `kdec.exe` building and its byte-identical cross-check passing meanwhile.
- **One decoder, two builds:** `kdec` (native ooz helper): Linux build for WSL dev, mingw `kdec.exe`
  for Windows. They must produce byte-identical output. There is no `oodle-dll` decoder: the game
  links Oodle statically and ships no DLL (docs/SAVE_FORMAT.md §8).
- Stack: Node + TypeScript, npm workspaces (`packages/core`, `packages/cli`, `packages/web`).
- Day numbers: save is 0-based, game UI is 1-based. User-facing day = saveDay + 1.
- Money: IntVector (gold, silver, copper); copper-equivalent = g*100000 + s*1000 + c.
- Golden tests: fixtures/day199.expected.json and day100.expected.json must pass against
  SaveGame3.sav (save "1 Point Oh") with both kdec builds. The save is committed at `fixtures/saves/` (never modify
  it); its SHA-256 is pinned in `fixtures/save-fixture.json`.
  Neither golden day has coin activity. The second committed save, `fixtures/saves/Sand-SaveGame1.sav`,
  is pinned in `fixtures/save-fixture-sand.json` and covers minting in one core test file
  (`packages/core/test/coins-fixture.test.ts`). Never modify either save.
- Commands: `npm run build:native` (kdec for Linux, needs build-essential; also `kdec.exe` when g++-mingw-w64-x86-64
  is installed, otherwise the committed one is kept. After changing the native source, rebuild with mingw and commit
  `kdec.exe`), `npm run bootstrap`, `npm test`, `npm run typecheck`.
  `npm run build` (bundles the CLI to packages/cli/dist/af-ledger.mjs),
  `npm link -w @af-ledger/cli` (puts `af-ledger` on PATH; run outside the Codex sandbox).
  `AF_SKIP_WIN=1 npm test` skips the kdec.exe interop cross-check. Inside the Codex sandbox, tests that
  spawn Node, use WSL interop or listen on a socket skip themselves (`inCodexSandbox` in `packages/core/test/helpers/sandbox.ts`).
  Golden tests run with `kdec` in WSL only until a Windows test run (`test:win`) exists.
- Quest rewards are not stored in saves; Day 199's golden Daily Summary Profit excludes them (Day 100 had none).
- See [README.md](README.md) for the Windows quick start, configuration and CLI usage, and
  [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and tests.
- **Maintainer docs (private).** The maintainer keeps plans and agent notes in a separate private repo, checked out next
  to this one as `alchemy-factory-improved-ledger-develop`. If that folder exists, read its `AGENTS.md` before starting.
  From a git worktree, it is at
  `"$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/../alchemy-factory-improved-ledger-develop"`.
  Files in this repo must make sense without it: never cite or link those docs here.
