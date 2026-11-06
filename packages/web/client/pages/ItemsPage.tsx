import { navigateRange } from '../navigation';
import { useEffect, useRef, useState } from 'react';
import { Button, columnUnit, ItemLabel, LedgerTable, Money, Notice, Panel, ShareBar, type SeriesKey } from '@design/components';
import type { ItemResponse, ItemsResponse, MetaResponse } from '../../shared/api';
import { defaultSort, nextSort, sortItems, totalUnits, unitPrice, type Sort, type SortKey } from '../economics';
import { routeHash, type Route } from '../route';
import { RangePicker } from '../parts/RangePicker';
import { Treemap } from '../parts/Treemap';
import { MoversList } from '../parts/MoversList';
import { ItemDetail } from '../parts/ItemDetail';
import { PageNotes } from '../parts/PageNotes';
const columns: { key: SortKey; label: string }[] = [{ key: 'name', label: 'Item' }, { key: 'units', label: 'Sold' }, { key: 'price', label: 'Unit price' }, { key: 'copper', label: 'Income' }, { key: 'share', label: 'Share of Shop Income' }];
export function ItemsPage({ meta, items, item, itemError, route }: { meta: MetaResponse; items: ItemsResponse | null; item: ItemResponse | null; itemError: string | null; route: Extract<Route, { page: 'items' }> }) {
  const [sort, setSort] = useState<Sort>(defaultSort), [all, setAll] = useState(false);
  const table = useRef<HTMLDivElement>(null);
  // LedgerTable accepts header content but has no header-attribute prop. Keep its
  // rendering and add the sort semantics to the actual column headers here.
  useEffect(() => {
    table.current?.querySelectorAll('thead th').forEach((th, i) => th.setAttribute('aria-sort', columns[i].key === sort.key ? sort.direction : 'none'));
  }, [sort, items]);
  const select = (id: string) => { location.hash = routeHash({ ...route, item: id }); };
  const rows = sortItems(items?.items ?? [], sort);
  const priceUnit = columnUnit(rows.map(unitPrice)), incomeUnit = columnUnit([items?.shopTotal ?? 0, ...rows.map(r => r.copper)]);
  return <>
    <section className="flex flex-wrap items-end justify-between gap-3"><div className="min-w-0"><p className="type-eyebrow uppercase text-muted">Item economics</p><h1 className="type-display mt-1">What made the money{items ? `, Days ${items.from} to ${items.to}` : ''}</h1>{items && <p className="type-small text-muted mt-1">Shop Income <Money copper={items.shopTotal} unit={incomeUnit} /> over {items.to - items.from + 1} days</p>}</div><RangePicker range={route.range} latestDay={meta.latestDay} onChange={(range, replace) => navigateRange({ ...route, range }, replace)} /></section>
    {!items ? <Panel title="Item economics">No completed days yet.</Panel> : !rows.length ? <Panel title="Shop Income">No shop sales in this range.</Panel> : <>
      <Panel eyebrow="Shop Income" title="By category and item"><Treemap items={items} onSelect={select} /></Panel>
      <div className="today-grid"><Panel eyebrow="The same numbers" title="Shop items" padded={false} actions={rows.length > 12 ? <Button size="sm" onClick={() => setAll(v => !v)}>{all ? 'Show top 12' : `Show all ${rows.length}`}</Button> : undefined}>
        <div ref={table} className="items-table"><LedgerTable rowAction={i => () => select(rows[i].item)} rowSelected={i => rows[i].item === item?.item} caption="Shop items: every column header sorts the table" columns={columns.map(c => ({ header: <button type="button" className="sort-button type-label" onClick={() => setSort(s => nextSort(s, c.key))}>{c.label} <span aria-hidden="true">{sort.key === c.key ? sort.direction === 'ascending' ? '▲' : '▼' : '↕'}</span></button>, align: c.key === 'name' || c.key === 'share' ? 'start' : 'end', className: c.key === 'units' || c.key === 'price' ? 'item-secondary' : undefined }))} rows={(all ? rows : rows.slice(0, 12)).map(r => [
          <button type="button" className={`row-button text-start ${item?.item === r.item ? 'text-accent-ink' : ''}`}><ItemLabel name={r.name} series={r.category === 'uncategorized' ? undefined : r.category as SeriesKey} iconSrc={meta.iconItems.includes(r.item) ? `/api/icon/${encodeURIComponent(r.item)}` : undefined} detail={r.category === 'uncategorized' ? 'Uncategorized' : r.category[0].toUpperCase() + r.category.slice(1)} /></button>, r.units.toLocaleString(), <Money copper={unitPrice(r)} unit={priceUnit} />, <Money copper={r.copper} unit={incomeUnit} />, <ShareBar fraction={items.shopTotal ? r.copper / items.shopTotal : 0} series={r.category === 'uncategorized' ? 'sundries' : r.category as SeriesKey} />,
        ])} footer={['Total', totalUnits(items.items).toLocaleString(), '', <Money copper={items.shopTotal} unit={incomeUnit} />, '100%']} /></div>
      </Panel><MoversList data={items} onSelect={select} /></div>
    </>}
    {itemError && <Notice>{itemError}</Notice>}
    {item && <ItemDetail item={item} meta={meta} />}
    <PageNotes meta={meta} page="items" />
  </>;
}
