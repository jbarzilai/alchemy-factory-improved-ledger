import { columnUnit, LedgerTable, Panel } from '@design/components';
import type { DayResponse } from '../../shared/api';
import { summaryLines, changeCells, changeColumns, lineLabel, lineAmount } from './summary';
import type { DaySelection, DayStream } from '../route';
export function SumBlock({ day, selection, onChange }: { day: DayResponse; selection: DaySelection; onChange: (sel: DaySelection) => void }) {
  const streams: DayStream[] = ['shop', 'orders', 'purchasing'];
  const lines = summaryLines(day);
  const unit = columnUnit(lines.map(l => l.copper));
  const deltaUnit = columnUnit(lines.map(l => l.copper - (l.previous ?? l.copper)));
  return <Panel eyebrow="Daily summary" title={`Day ${day.day} in one sum`} padded={false}>
    <LedgerTable rowAction={i => i < 3 ? () => onChange({ stream: streams[i], category: 'all', item: null }) : undefined} rowSelected={i => i < 3 && selection.stream === streams[i] && (i !== 0 || selection.category === 'all')} className="summary-table" caption={`Day ${day.day}: Shop Income plus Order Income minus Purchasing Cost, plus Quest Rewards gives Profit.`} columns={[{ header: <span className="sr-only">Operation</span> }, { header: 'Line' }, { header: 'Amount', align: 'end' }, ...changeColumns]} rows={lines.map((line, i) => [<span aria-hidden="true" className="text-muted">{line.symbol}</span>, i < 3 ? <button type="button" className="row-button">{lineLabel(line, day)}</button> : lineLabel(line, day), lineAmount(line, unit), ...changeCells(line.copper, line.previous, deltaUnit, line.expense)])} />
  </Panel>;
}
