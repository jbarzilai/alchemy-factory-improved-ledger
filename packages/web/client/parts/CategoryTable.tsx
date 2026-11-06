import { columnUnit, LedgerTable, Money, Panel } from '@design/components';
import type { DayResponse } from '../../shared/api';
import { categories, categoryShare, changeCells, changeColumns, Swatch } from './summary';
import type { DaySelection, ShopFilter } from '../route';
export function CategoryTable({ day, selection, onChange }: { day: DayResponse; selection: DaySelection; onChange: (sel: DaySelection) => void }) {
  const sources = categories(day);
  const unit = columnUnit(sources.map(s => s.copper));
  const deltaUnit = columnUnit(sources.map(s => s.copper - (s.previous ?? s.copper)));
  const total = sources.reduce((sum, s) => sum + s.copper, 0);
  return <Panel eyebrow="Shop Income" title="By shop category" padded={false}>
    <LedgerTable rowAction={i => () => onChange({ stream: 'shop', category: sources[i].key as ShopFilter, item: null })} rowSelected={i => selection.stream === 'shop' && selection.category === sources[i].key} className="summary-table" caption={`Day ${day.day} Shop Income by category`} columns={[{ header: 'Category' }, { header: 'Amount', align: 'end' }, { header: 'Share of Shop Income' }, ...changeColumns]} rows={sources.map(s => [<button type="button" className="row-button"><Swatch series={s.key === 'uncategorized' ? undefined : s.key} />{s.label}</button>, <Money copper={s.copper} unit={unit} />, categoryShare(s.key, s.copper, total), ...changeCells(s.copper, s.previous, deltaUnit)])} />
  </Panel>;
}
