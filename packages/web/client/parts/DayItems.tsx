import { useEffect, useRef } from 'react';
import { columnUnit, formatMoney, ItemLabel, LedgerTable, Money, Panel, SegmentedControl, type SeriesKey, type Unit } from '@design/components';
import type { DayItemLine, DayResponse, MetaResponse } from '../../shared/api';
import { expandedItem, flagSentence, linesTotal, selectionTitle, shopChips, unitPrice, visibleLines } from '../dayItems';
import { routeHash, type DaySelection, type DayStream } from '../route';
import { moneyChange } from '../today';
import { Swatch } from './summary';

const dash = <span className="text-muted">–</span>;
function amount(copper: number | null, unit: Unit, unpriced = false) {
  return copper === null ? <span className="text-muted">–{unpriced && <span className="type-micro ml-1">unpriced</span>}</span> : <Money copper={copper} unit={unit} />;
}
function change(today: number | null, previous: number | null, unit: Unit | null, expense: boolean) {
  if (today === null || previous === null) return dash;
  const delta = today - previous;
  if (delta === 0) return <span className="text-muted">same</span>;
  const formatted = unit ? formatMoney(delta, unit, true) : { text: `${delta > 0 ? '+' : '−'}${Math.abs(delta).toLocaleString()}`, suffix: '' };
  const display = moneyChange(delta, formatted, expense);
  return <span className={`whitespace-nowrap ${display.color}`}>{display.arrow} {display.text}{display.suffix}</span>;
}
export function DayItems({ day, meta, selection, onChange }: { day: DayResponse; meta: MetaResponse; selection: DaySelection; onChange: (sel: DaySelection) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const lines = visibleLines(day, selection), expanded = expandedItem(day, selection);
  useEffect(() => {
    if (expanded !== null) {
      const button = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-day-item]') ?? []).find(el => el.dataset.dayItem === expanded);
      button?.closest('tr')?.scrollIntoView({ block: 'nearest' });
    }
  }, [expanded]);
  const coin = selection.stream === 'minted' || selection.stream === 'melted';
  const expense = selection.stream === 'purchasing' || selection.stream === 'melted';
  const unitsLabel = selection.stream === 'shop' ? 'Sold' : selection.stream === 'orders' ? 'Dispatched' : selection.stream === 'minted' ? 'Minted' : selection.stream === 'melted' ? 'Melted' : 'Bought';
  const moneyLabel = expense ? 'Cost' : coin ? 'Value' : selection.stream === 'orders' ? 'Order Income' : 'Income';
  const previousLabel = day.previousDay === null ? 'Previous day' : `Day ${day.previousDay}`;
  const incomeUnit = columnUnit(lines.flatMap(l => l.copper === null ? [] : [l.copper]));
  const deltaUnit = columnUnit(lines.flatMap(l => l.copper === null || l.previousCopper === null ? [] : [l.copper - l.previousCopper]));
  const chips = shopChips(day), chipUnit = columnUnit(chips.map(c => c.copper));
  const flagFor = (line: DayItemLine) => coin ? undefined : day.flags.find(f => f.stream === selection.stream && f.item === line.item);
  function detail(line: DayItemLine) {
    const price = unitPrice(line.units, line.copper), previousPrice = unitPrice(line.previousUnits, line.previousCopper);
    const valueUnit = columnUnit([line.copper ?? 0, line.previousCopper ?? 0]);
    const priceUnit = columnUnit([price ?? 0, previousPrice ?? 0]);
    const detailDeltaUnit = columnUnit([line.copper !== null && line.previousCopper !== null ? line.copper - line.previousCopper : 0, flagFor(line)?.impact ?? 0]);
    const flag = flagFor(line);
    return <div className="flex flex-col gap-3 border-b border-line bg-raised/30 p-4">
      <LedgerTable caption={`${line.name}: today against the previous day`} columns={[{ header: 'Measure' }, { header: previousLabel, align: 'end' }, { header: `Day ${day.day}`, align: 'end' }, { header: 'Change', align: 'end' }]} rows={[
        [unitsLabel, line.previousUnits === null ? dash : line.previousUnits.toLocaleString(), line.units.toLocaleString(), change(line.units, line.previousUnits, null, expense)],
        ...(!coin ? [['Unit price', amount(previousPrice, priceUnit), amount(price, priceUnit), change(price, previousPrice, priceUnit, expense)]] : []),
        [moneyLabel, amount(line.previousCopper, valueUnit, day.previousDay !== null), amount(line.copper, valueUnit, true), change(line.copper, line.previousCopper, detailDeltaUnit, expense)],
      ]} />
      {flag && <p className="type-small">{flagSentence(flag, meta.settings, copper => { const money = formatMoney(copper, detailDeltaUnit, true); return money.text + money.suffix; })}</p>}
      {!coin && !expense && <a className="type-small text-accent-ink underline" href={routeHash({ page: 'items', range: { last: 7 }, item: line.item })}>{line.name} over time in Item economics →</a>}
    </div>;
  }
  // The whole stream's unit, so a category total matches its chip and category row (3.71g, not 370.75s).
  const total = formatMoney(linesTotal(lines), columnUnit([linesTotal(day.items[selection.stream])]));
  return <div ref={root}><Panel eyebrow={`Day ${day.day} items · ${total.text}${total.suffix}`} title={selectionTitle(selection)} padded={false} actions={
    <SegmentedControl<DayStream> label="Day items stream" value={selection.stream} options={[{ value: 'shop', label: 'Shop Income' }, { value: 'orders', label: 'Order Income' }, { value: 'purchasing', label: 'Purchasing Cost' }, ...(day.showCoins ? [{ value: 'minted' as const, label: 'Coins Minted' }, { value: 'melted' as const, label: 'Coins Melted' }] : [])]} onChange={stream => onChange({ stream, category: 'all', item: null })} />
  }>
    {selection.stream === 'shop' && <div className="flex flex-wrap gap-2 p-4">{chips.map(c => <button key={c.key} type="button" aria-pressed={selection.category === c.key} className={`row-button day-items-chip rounded-full border border-line type-small ${selection.category === c.key ? 'bg-accent-soft text-accent-ink' : 'hover:bg-raised'}`} onClick={() => onChange({ stream: 'shop', category: c.key, item: null })}><Swatch series={c.key === 'all' || c.key === 'uncategorized' ? undefined : c.key} />{c.label} <Money copper={c.copper} unit={chipUnit} /></button>)}</div>}
    {!lines.length ? <p className="p-4 text-muted">No items</p> : <LedgerTable className="day-items-table" caption={`${selectionTitle(selection)} items for Day ${day.day}`} columns={[{ header: 'Item' }, { header: unitsLabel, align: 'end' }, { header: previousLabel, align: 'end' }, { header: 'Change', align: 'end' }, { header: moneyLabel, align: 'end' }, { header: 'Change', align: 'end' }]} rows={lines.map(line => [
      <button type="button" className="row-button" data-day-item={line.item} aria-expanded={expanded === line.item}><ItemLabel name={line.name} series={line.category === 'uncategorized' || line.category === null ? undefined : line.category as SeriesKey} iconSrc={meta.iconItems.includes(line.item) ? `/api/icon/${encodeURIComponent(line.item)}` : undefined} />{flagFor(line) && <svg role="img" aria-label="has flag" viewBox="0 0 16 16" className="size-3 shrink-0 text-loss" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3.5 15V1.5M3.5 2H13l-2.25 3.25L13 8.5H3.5" /></svg>}</button>,
      line.units.toLocaleString(), line.previousUnits === null ? dash : line.previousUnits.toLocaleString(), change(line.units, line.previousUnits, null, expense), amount(line.copper, incomeUnit, true), change(line.copper, line.previousCopper, deltaUnit, expense),
    ])} rowAction={i => () => onChange({ ...selection, item: expanded === lines[i].item ? null : lines[i].item })} rowSelected={i => expanded === lines[i].item} rowDetail={i => expanded === lines[i].item ? detail(lines[i]) : null} />}
  </Panel></div>;
}
