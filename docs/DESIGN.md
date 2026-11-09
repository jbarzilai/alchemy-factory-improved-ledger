# Design: Alchemy Ledger

The look of the web app. The source lives in [`design/`](../design/).

- **`design/` is the source of truth.** Change the design there; the web app imports it.
- `design/tokens.json`: colours (dark "Night shift" and light "Parchment"), type, spacing, radius, shadow.
- `design/tokens.css`: those tokens as CSS variables and `type-*` classes, generated with `npm run tokens`.
- `design/tailwind.css`: the Tailwind v4 entry; maps every token to a utility and holds no values of its own.
- `design/components/`: the React components (`index.tsx`, `index.d.ts`) and their usage notes (`README.md`).
  `packages/web` imports them through the `@design/components` alias.
- The look is adapted from YAAFC (monstrel/yaafc, GPL-3.0). Item icons come from `assets/icons/` (`af-ledger
  refresh-icons`); an item without one gets a lettered tile.

The look of the Alchemy Factory ledger website: a warm, dense workshop interface for reading a factory's daily money. Night shift (dark) is the primary theme; Parchment (light) is its equal partner. Build with React and Tailwind v4; every colour, size and radius comes from `tokens.json`.

## Content fundamentals

- **Use the game's words.** Earnings, Expenses, Profit, Shop income, Order income, Quest rewards, Purchasing: the same terms as the in-game Daily Summary. Shop categories are Sundries, Potion, Beverage, Jewelry and Relic. The exception is **Coins Minted** / **Coins Melted**, instead of the game's "Coin Minting" / "Coin Smelting". Text describing the save or quoting the game keeps the game's wording.
- **Use in-game names, never internal IDs.** "Transformation Potion", not `ManaPotion`; "Fertile Catalyst", not `Catalyst2`. Names come from `item-names.json`. Show an ID only as data, in `type-code`.
- **Days are the game's days.** Always the 1-based day the game shows ("Day 199"). Compare with the previous day by naming it: "vs Day 198", never "yesterday".
- **Money has one unit per column.** Never mix gold, silver and copper in one column or one row of tiles. Mixed mode picks one unit from the largest value; gold and silver show two decimals (`57.72g`), copper shows whole numbers (`4,608c`).
- **Sentence case** for titles, buttons and labels. Uppercase only for eyebrows.
- **Say what the numbers can't.** Estimated or missing data gets a `Notice` in one plain sentence: "Quest rewards use the save's current Quest Rewards bonus (128%), as the game's own ledger does." No apologies, no hedging.
- Second person, sparingly ("your factory"). No emoji, no exclamation marks.

## Visual foundations

### Colour

- Surfaces stack `bg` → `panel` → `raised`. The page is `bg`; every block of content sits on a `panel`; emphasis inside a panel uses a `raised` well. Text is `ink`, secondary text `muted`.
- Edges: `line` for hairlines (panel borders, table rules), `line-strong` for anything a person operates (buttons, inputs, the active tab). `line-strong` clears 3:1 on every surface.
- **Gold is the brand.** `accent` is a fill (the one primary button, a selected indicator) with `on-accent` text on it. Gold as text is `accent-ink`. Keep gold rare enough that it marks the one thing to look at.
- `violet` is the second accent: links, and the estimate marker for values the ledger computes instead of reading from the save.
- **Gain and loss mean good or bad for profit.** `gain` for income up or spending down; `loss` for income down or spending up. Always pair them with an arrow and a printed sign, on `gain-soft`/`loss-soft` chips. Never use them for anything else.
- Every text colour meets 4.5:1 on `bg`, `panel` and `raised` in both themes.

### Charts

- **Colour follows the entity.** Each income source has a fixed series token: `series-sundries`, `series-potion`, `series-beverage`, `series-jewelry`, `series-relic`, `series-orders`, `series-quests`, `series-minted`. `series-purchasing` and `series-melted` are neutrals, drawn below the baseline as negative bars. Filtering a chart never repaints the series that remain.
- Stack in the token order above (Sundries first, Coins Minted after Quest Rewards). Below the baseline, Coins Melted follows Purchasing Cost. That order was validated for colour-blind separation between neighbours in both themes; do not reorder stacks by size.
- The series colours are for marks only. Labels, values and legends stay in `ink` and `muted`.
- Every chart with two or more series has a `SeriesLegend`, and every chart has the same numbers in a table nearby. In Parchment, Sundries, Beverage and Orders sit below 3:1 on `panel`, so the legend and table are required, not optional.
- One y-axis per chart. Thin marks, a faint `line` grid, axis text in `type-micro` `muted`.

Coin series colours:

| Token | Night shift | Parchment | Place |
| --- | --- | --- | --- |
| `series-minted` | `#2bb3c0` (teal) | `#1a9fb0` | After Quest Rewards, above the baseline |
| `series-melted` | `#c2b49c` (warm stone grey) | `#5f5a52` | After Purchasing Cost, below the baseline |

Colour check (2026-11-08): simulate protanopia, deuteranopia and tritanopia with Machado 2009
matrices at full severity, then take the worst CIEDE2000 difference across those simulations and
normal vision. Both new neighbour pairs pass 15, about the existing palette's weakest neighbour
pair (Beverage / Jewelry: 16.3 in Night shift, 14.7 in Parchment).

| Pair | Night shift | Parchment |
| --- | --- | --- |
| Quest Rewards / Coins Minted | 25.3 | 22.0 |
| Purchasing Cost / Coins Melted | 16.0 | 16.3 |

In normal vision, each new colour differs from every other series by at least 22. Contrast on
`panel` is 6.6:1 / 3.2:1 for Coins Minted and 8.2:1 / 6.8:1 for Coins Melted (Night shift / Parchment).
Non-neighbours can remain close under simulation, including Coins Minted near Relic and Beverage
under protanopia, so legends and tables remain required. Series colours stay on marks, not text.

### Type

- One family for the interface, IBM Plex Sans (`--font-ui`), with tabular figures everywhere so amounts line up. IBM Plex Mono (`--font-data`) only for IDs and paths.
- Use the type classes, never ad-hoc sizes: `type-display` for the day headline (one per page), `type-kpi` for stat tile values, `type-title` for panel titles, `type-heading` for sub-heads and totals, `type-body` for text and table cells, `type-small` for notices, legends and small controls, `type-label` for column headers and captions, `type-eyebrow` (with `uppercase`) above a panel title, `type-micro` for chips, counts and axis ticks.

### Space, shape, depth

- Spacing steps of 4px (`space-1`). Panels pad `space-4`; tiles sit `space-3` apart; panels stack `space-6` apart.
- Corners: `corner-lg` for panels and tiles, `corner-md` for buttons, inputs, tabs and notices, `corner-sm` inside segmented controls, `corner-xs` for chips and swatches, `corner-pill` for counts and bar tracks.
- Borders separate surfaces, not shadows. `elevation-popover` and `elevation-dialog` are only for things that float: menus, chart tooltips, dialogs, the day detail panel.

### States

- Hover: rows and ghost controls take `raised`; secondary buttons darken to `line`.
- Selected: `accent-soft` ground with `accent-ink` text.
- Focus: a 2px solid `focus` outline with a 2px offset, on every interactive element. It clears 3:1 on every surface.
- Disabled: 45% opacity, no pointer events.
- Motion: colour transitions only, and none under `prefers-reduced-motion`.

### Layout

- Dense and scannable: summary first (stat tiles), then breakdowns (panels with tables and charts), then detail. A page is a column of panels, or a two-column grid on wide screens that stacks to one column below 900px.
- Tables scroll sideways inside their panel on narrow screens; the page never does.

## Using it with Tailwind

- Load `design/tokens.css`, then `design/tailwind.css`. The Tailwind file maps every token to a utility and holds no values of its own: `bg-panel`, `text-muted`, `border-line-strong`, `bg-relic`, `rounded-lg`, `p-4` (= `space-4`).
- The default Tailwind palette and type scale are not loaded. Colours come only from the tokens; text size, weight and line height come only from the `type-*` classes.
- Switch themes with `data-theme="dark"` or `data-theme="light"` on `<html>`. Without one, the first theme (dark) applies; set it from `prefers-color-scheme` on load.
- The React components (`design/components/index.tsx`) use only these utilities and classes. The web app imports them unchanged; don't restyle them.
- Self-host the two IBM Plex families in the app so it works offline.

## Iconography

- Item icons are the game's own item art, extracted to `assets/icons/` by `af-ledger refresh-icons`. An item without one gets a lettered tile in `ItemLabel`: the item's initials on its series colour at 25%. Purchased materials get a plain `raised` tile.
- Interface glyphs are simple inline SVG line icons, 16px, 1.6px stroke, in `currentColor`. Day stepping uses text arrows (← →). No emoji, no icon fonts.
