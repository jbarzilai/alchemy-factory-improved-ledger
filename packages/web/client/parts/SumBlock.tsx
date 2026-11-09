import { columnUnit, LedgerTable, Panel } from '@design/components';
import type { DayResponse } from '../../shared/api';
import { changeCells, changeColumns, lineLabel, lineAmount } from './summary';
import { summaryLines, subtotalLines } from '../today';
import type { DaySelection } from '../route';
export function SumBlock({ day, selection, onChange }: { day: DayResponse; selection: DaySelection; onChange: (sel: DaySelection) => void }) {
  const lines = summaryLines(day);
  const subtotals = subtotalLines(day);
  const subtotalUnit = columnUnit(subtotals.map(l => l.copper));
  const subtotalDeltaUnit = columnUnit(subtotals.map(l => l.copper - (l.previous ?? l.copper)));
  const unit = columnUnit(lines.map(l => l.copper));
  const deltaUnit = columnUnit(lines.map(l => l.copper - (l.previous ?? l.copper)));
  return <Panel eyebrow="Daily summary" title={`Day ${day.day} in one sum`} padded={false}>
    <LedgerTable rowAction={i => lines[i].stream ? () => onChange({ stream: lines[i].stream!, category: 'all', item: null }) : undefined} rowSelected={i => !!lines[i].stream && selection.stream === lines[i].stream && (lines[i].stream !== 'shop' || selection.category === 'all')} className="summary-table" caption={`Day ${day.day}: Shop Income plus Order Income minus Purchasing Cost, plus Quest Rewards${day.showCoins ? ', plus Coins Minted, minus Coins Melted' : ''} gives Profit.`} columns={[{ header: <span className="sr-only">Operation</span> }, { header: 'Line' }, { header: 'Amount', align: 'end' }, ...changeColumns]} rows={lines.map(line => [<span aria-hidden="true" className="text-muted">{line.symbol}</span>, line.stream ? <button type="button" className="row-button">{lineLabel(line, day)}</button> : lineLabel(line, day), lineAmount(line, unit), ...changeCells(line.copper, line.previous, deltaUnit, line.expense)])} />
    <details className="border-t border-line p-4">
      <summary className="cursor-pointer type-small text-muted">Sub-totals</summary>
      <LedgerTable caption={`Day ${day.day} sub-totals`} columns={[{ header: 'Line' }, { header: 'Amount', align: 'end' }, ...changeColumns]} rows={subtotals.map(line => [lineLabel(line, day), lineAmount(line, subtotalUnit), ...changeCells(line.copper, line.previous, subtotalDeltaUnit)])} />
      <p className="type-small text-muted mt-3">The game's Daily Summary leaves out the coins you mint and melt; the game's Ledger tab includes them.</p>
    </details>
  </Panel>;
}
