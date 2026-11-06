# Alchemy Ledger components

Usage notes for each component in `index.tsx` (types in `index.d.ts`). The rules they follow are in [docs/DESIGN.md](../../docs/DESIGN.md).

## Money

An amount of money, from its copper-equivalent value. `formatMoney`, `pickUnit` and `columnUnit` are exported for charts and plain text.

- **Provide:** `copper` (an integer: 1g = 100,000c, 1s = 1,000c), `unit` (`mixed` default, `gold`, `silver`, `copper`), and `signed` for changes.
- Gold and silver show two decimals; copper shows whole numbers with thousands separators. The coin suffix (`g`, `s`, `c`) is `muted`.
- **One unit per column.** In a table, call `columnUnit(values)` once and pass that unit to every cell, so numbers line up and compare directly. Mixed thresholds match the CLI: gold from 1,000,000c, silver from 10,000c.
- Negative amounts use a true minus sign (−). A value that rounds to zero has no sign.

## DeltaChip

The change against the comparison day, coloured by what it does to profit.

- **Provide:** `change` in copper (today minus the comparison day), `base` (the comparison amount, adds a percentage), and `kind`: `income` (default) or `expense`.
- **Colour means good or bad for profit, not up or down.** Income up and spending down are `gain`; income down and spending up are `loss`. The arrow always shows the direction, and the sign is always printed, so colour is never the only cue.
- With no `base` (the comparison day had none of it), only the amount shows.

## StatTile

One headline amount with its change against the comparison day: the Earnings, Expenses and Profit row at the top of a day.

- **Provide:** `label`, the amount in `copper`, and usually a `delta` (a `DeltaChip`) and `caption` ("vs Day 198"). `unit` defaults to mixed; `icon` is optional and drawn in `accent-ink`.
- Use tiles only for the bottom line. Three or four in a row; never a wall of tiles.
- Pass the tile's unit to its `DeltaChip` so the value and its change read in the same coin.

## Panel

The surface that holds one block of the page: a chart, a table, a breakdown.

- **Provide:** `children`; optionally `title`, an `eyebrow` (one uppercase word naming the section, such as INCOME), and `actions` (small ghost buttons or a segmented control). Set `padded={false}` when the content is a table that runs edge to edge.
- `panel` on `bg` with a 1px `line` border and `corner-lg`. No shadow: panels sit on the page, they do not float.
- One idea per panel. Do not nest panels; use `raised` wells (a `Notice`, a table row hover) for emphasis inside one.

## Button

A command the person runs: open a day, export, step to the previous day.

- **Provide:** the label as children, and `onClick`. `variant` is `primary`, `secondary` (default) or `ghost`; `size` is `md` (default) or `sm`. Every native button attribute passes through.
- **One primary per view.** It is the gold fill (`accent` with `on-accent` text), so it reads as the main action. Everything else is `secondary`; toolbar and stepping actions are `ghost`.
- Label with a verb and its object: "Export PNG", "Open Day 199". Arrows for day stepping are text (`← Day 198`), not icons.
- Disabled buttons fade to 45% and ignore the pointer. Prefer explaining why nearby over leaving a dead button.

## SegmentedControl

A choice of two to five mutually exclusive views of the same data: the day range, the money unit.

- **Provide:** `options` (`{value, label}`), the current `value`, `onChange`, and a `label` naming what the choice controls (read by screen readers).
- The selected segment is gold text on `accent-soft` with a thin gold ring; the rest are `muted` until hovered.
- Use it for view settings only. A command is a `Button`; navigation between pages is `NavTabs`.
- Name ranges in days ("7 days", "All 199") rather than "1W" or "Max".

## NavTabs

The page switcher at the top of the app: Dashboard, Item economics, Money flow, Days.

- **Provide:** `items` (`{id, label, count?}`), the `active` id and `onSelect`. Each tab is a real link to `#<id>`, so hash routing works without `onSelect`.
- The active tab gets a `line-strong` outline on `panel` and gold text, and `aria-current="page"`.
- `count` shows a small pill, for example the number of completed days. Keep it to counts the person cares about.

## LedgerTable

Rows of items or categories with their counts, amounts and changes. The workhorse of every page.

- **Provide:** `columns` (`{header, align?, className?}`), `rows` as arrays of cells, an optional `footer` total row, and a `caption` for screen readers.
- Text columns align start; money, counts and changes align `end`. Cells use tabular figures.
- Compute one unit per money column with `columnUnit` and use it in every cell and the footer.
- Put it in a `Panel` with `padded={false}`. On narrow screens it scrolls sideways inside its own container.
- Order rows by the amount shown, largest first, unless the person picked another sort.
- **Clickable rows:** `rowAction(i)` returns the row's click handler (or `undefined` for a plain row); the whole row is the target. Put a handler-free `<button>` in the label cell so keyboard users can reach the row: its click bubbles to the row. `rowSelected(i)` highlights the row in `accent-soft`. `rowDetail(i)` returns a full-width block shown directly under the row (an expanded detail), or `null`.

## ItemLabel

An item's in-game name with its icon, and an optional detail line such as "192 sold".

- **Provide:** `name` (the in-game display name from `item-names.json`, never the internal ID), optionally `series` (the shop category or income source that tints the icon), `iconSrc` and `detail`.
- Without `iconSrc` (an item missing from `assets/icons/`), a lettered tile stands in: the initials of the name on the series colour at 25%. Purchased materials have no series and get a plain `raised` tile.
- With `iconSrc`, the icon replaces the tile with no other change.

## ShareBar

A thin bar showing what part of a whole one line contributes, with its percentage.

- **Provide:** `fraction` (0 to 1) and the `series` it belongs to.
- Use it inside table rows (share of Earnings, share of Shop income). It is a reading aid next to the amount, never a replacement for it.

## SeriesLegend

The key for a chart: a swatch and a name per series.

- **Provide:** `series`, the keys shown in the chart, in the chart's order. `SERIES` (exported) lists every key with its label, Tailwind class and CSS variable.
- Every chart with two or more series has a legend. Colour follows the entity: Potion is always the same violet, whatever else is on screen.

## Notice

A one-line note about the data on screen: what is estimated, what is missing, what is still changing.

- **Provide:** the sentence as `children`, and a `tone`: `estimate` (computed rather than read from the save, such as quest rewards), `missing` (items without a price), or `info`.
- Say exactly what is affected and why, in one sentence. Put notices directly under the numbers they qualify.
- Not for errors that stop the page; those get their own empty state.
