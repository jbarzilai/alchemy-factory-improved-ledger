# af-ledger

af-ledger reads Alchemy Factory saves and displays daily Earnings, Expenses and Profit,
with comparisons, category breakdowns and item movers. Day numbers match the game UI.

**Saves are read-only input.** af-ledger never modifies a save or writes into the game's
saves folder. Parsing happens in memory; local caches and test copies live in the repository's `.cache/`.

## Quick start (Windows)

1. Install [Node.js](https://nodejs.org/) 22 or newer.
2. Download or clone this repository, then open PowerShell in its folder.
3. Run:

   ```powershell
   npm ci
   npm run web
   ```

4. Open <http://localhost:4317>. The page uses your newest save, autosaves included, and updates
   by itself when the game saves.

Ctrl-C stops the server. Your saves are found at `%LOCALAPPDATA%\AlchemyFactory\Saved\SaveGames`;
if yours are elsewhere, run `npm run bootstrap` or see [Configuration](#configuration).

The site is meant for this PC only: keep `web.host` at `localhost` in `config/settings.json`.
Opening it from another device on your network is not supported.

### Pages

Today shows a completed day's money sum, Quest Rewards and flags. History compares
Profit (quests included), income and purchasing over 3 days, 7 days or a custom
range, with a whole-save Profit heatmap and events. Item economics shows Shop
Income by category and item, sortable sales, rising and falling income per day,
and each item's daily sales and flags.

### Settings

`config/settings.json` controls app behaviour: web host, port and save-watch interval,
plus flag thresholds. Missing settings use the defaults; unknown or invalid settings report an error.

The gear on Today's Flags panel opens **Customize flags**, where you can change the
thresholds and switch Shop Income and Order Income or Purchasing Cost flags off. Save
writes `config/flags.local.json`, holding only changed values (group switches included)
and overriding `config/settings.json`. Deleting that file restores the defaults.

## Configuration

Paths on this machine live in `.env` in the repository (git-ignored). `npm run bootstrap`
finds the saves folder and the Steam game install and writes them there. If `.env` already
exists, bootstrap only shows what it would write; run `npm run bootstrap -- --force` to replace
the detected paths and keep every other setting. If detection fails, fill in the paths yourself,
using `.env.example` as a guide.

The CLI, the website and the helper scripts read the repository's `.env` from any working folder.
Each setting comes from the first of these that has it:

1. the process environment (an empty value counts as unset);
2. the `.env` file, or the file named by `AF_ENV_FILE` (`AF_ENV_FILE=none` reads no file);
3. the built-in default, where there is one.

- `AF_SAVE_DIR`: saves root containing the slots. Optional on native Windows (defaults to
  `%LOCALAPPDATA%\AlchemyFactory\Saved\SaveGames`), required on Linux/WSL.
- `AF_GAME_DIR`: Alchemy Factory install folder, only needed by refresh-game-data and refresh-icons.
- `AF_EXPORT_DIR`: PNG output directory (default: repository `exports/`).
- `AF_KDEC`: decoder executable (default: the platform build).

Use single quotes around paths to preserve Windows backslashes. `--save <file|folder>` takes
precedence over `AF_SAVE_DIR`.

## Website options

`npm run web -- --save <file|folder>` overrides the save. `npm run web -- --prod` builds the
client and serves it statically on the same port (bundles go to the git-ignored `packages/web/dist/`).
Host and port are set only in `config/settings.json`.

## CLI setup

The CLI is optional; the website does not need it. It needs Node.js 22 or newer. On Windows
(PowerShell) or Linux/WSL, from the repository root:

```sh
npm ci
npm run build
npm run bootstrap
npm link -w @af-ledger/cli
af-ledger doctor
```

On Linux/WSL, also run `npm run build:native` first (needs `build-essential`) to build the
Linux decoder `kdec`, and set `AF_SAVE_DIR` (bootstrap does this when it finds the saves
through `/mnt/c/...`). When using WSL, open the website at `http://localhost:4317` in the
Windows browser.

## CLI usage

`doctor` checks Node, the decoder, config and save discovery:

```sh
af-ledger doctor
```

`af-ledger refresh-game-data [--game-dir <dir>] [--output <file>]` regenerates item prices from the installed game (defaults to `AF_GAME_DIR`).

`af-ledger refresh-icons [--game-dir <dir>] [--output <dir>] [--size <n>]` extracts item icons from that install
into `assets/icons/` (64×64 PNGs and `index.json` by default). It removes stale PNGs and refuses to write if fewer
than 150 icons resolve. `npm run refresh:game-data` builds the CLI and runs both refresh commands.
`doctor` reports the bundled icon count and warns when the installed containers have changed.

`day [N]` shows one UI day's breakdown against the previous day. With no N it selects the
latest completed day; `--partial` without N selects today. Bonuses shows Shop Profit, inferred
category profits and the current Quest Rewards bonus. Earnings are split into Shop, Orders and
Quests, with Shop also broken down by category. `--top N` limits each Shop and Orders movers
table (default 10); Purchasing shows every changed item. Without a previous day, Shop and Orders
show up to N top items and Purchasing shows all items.
Items use in-game English names, with unknown IDs shown as-is.

```sh
af-ledger day 199 --save fixtures/saves/SaveGame3.sav --unit copper
```

Example of the default Day 199 overview (file and save timestamp omitted):

```text
Bonuses
Shop Profit      120%
Sundries Profit  180%
Potion Profit    180%
Beverage Profit  140%
Relic Profit     140%
Jewelry Profit   124%
Quest Rewards    128% (current)

Bottom line
           Amount  Previous   Change  Change %
Earnings  128.42g   154.06g  -25.65g    -16.6%
Expenses   70.70g    73.52g   -2.83g     -3.8%
Profit     57.72g    80.54g  -22.82g    -28.3%
```

`days` lists completed days oldest first; `--last N` keeps the newest N completed days.
`--partial` appends the in-progress day after that limit. Flags are `$` for unpriced
purchases, `q` for excluded quests with missing quest prices, and `~` for the in-progress day.

```sh
af-ledger days --last 5 --save fixtures/saves/SaveGame3.sav
```

### Export as an image

Use `af-ledger day 100 --png` or `af-ledger days --last 7 --png` to also save a terminal-style
PNG (the `day` image keeps the bold headings and green/red signs, even when piped). Text output stays the same; stderr prints the absolute image path.
Images go to the repository's git-ignored `exports/` folder by default; set `AF_EXPORT_DIR`
to change that directory, or use `--png --output ./report.png` for a specific file.
Missing parent directories are created and existing images are overwritten. Export cannot
be combined with `--json`, and output inside save folders is refused.

Both ledger commands support `--unit mixed|gold|silver|copper` and `--json` (copper values).
`day --json` retains internal IDs and adds a `names` lookup for the current and previous day's
items and quests, plus a `bonuses` object with whole percentages (unknown bonuses are null).
`days --json` remains an array of daily totals.

In mixed mode (the default) each group of amounts gets one unit, picked from its largest amount:

| Amounts | Unit picked from | Gold from | Silver from |
| --- | --- | --- | --- |
| A `day` report | the larger of that day's and the previous day's Earnings | 1,000,000c | 10,000c |
| A `days` column | that column's largest absolute value | 1,000,000c | 10,000c |
| A unit price | that price | 100,000c | 1,000c |

Below the silver threshold amounts are in copper. Gold and silver show two decimals; copper shows
whole numbers with separators. `--unit gold`, `silver` or `copper` forces that unit everywhere.

Quest payouts are reconstructed because saves do not store the final rewards. Random quests
use required counts × quest prices × the quest's GoldFactor × the save's current Quest Rewards
bonus. Fixed awards apply that bonus to each coin component and round to whole coins.
The game also recomputes historical quest rewards with the current bonus; random payouts may
differ by a few copper because exact rounding remains unresolved. Quests missing quest prices
are excluded and marked. See [the save-format notes](docs/SAVE_FORMAT.md#random-quest-payout-fitted-2026-10-26-not-stored).

`config/game-items.json` supplies purchase prices, quest prices, shop bases and categories,
extracted by `refresh-game-data`. `doctor` warns when installed container sizes or modification
times differ from the extraction stamp. Item names and quest skill bonuses remain in
`config/item-names.json` and `config/quest-skills.json`; the names are regenerated with the scripts in
[`reference/game-data/`](reference/game-data/README.md).

`AF_SAVE_DIR` configures the save root (the CLI selects the newest save across its slots).
`--save <file|folder>` overrides that environment variable. `AF_KDEC` overrides the decoder's
executable path; an empty value uses the bundled platform default. Colour uses TTY detection
and is disabled by a non-empty `NO_COLOR`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and tests.

## License

GPL-3.0-or-later (see `LICENSE`). The vendored Oodle Kraken decoder in `packages/core/native/ooz/` is
[ooz](https://github.com/powzix/ooz), Copyright (C) 2016 Powzix, GPL-3.0; see its `NOTICE.md`.
Alchemy Factory, its item names and its item icons (`assets/icons/`) belong to their respective owners; this is an
unofficial fan tool.
