import { navigateRange } from '../navigation';
import { useState } from 'react';
import { Button, columnUnit, LedgerTable, Money, Panel, StatTile } from '@design/components';
import type { HistoryResponse, MetaResponse } from '../../shared/api';
import { historyKpis, shopIncome } from '../economics';
import { type Route } from '../route';
import { RangePicker } from '../parts/RangePicker';
import { MoneyByDayChart } from '../parts/MoneyByDayChart';
import { Heatmap } from '../parts/Heatmap';
import { PageNotes } from '../parts/PageNotes';
export function HistoryPage({ meta, history, route }: { meta: MetaResponse; history: HistoryResponse | null; route: Extract<Route, { page: 'history' }> }) {
  const [all, setAll] = useState(false);
  const kpis = historyKpis(history?.days ?? [], meta.days.filter(d => history && d.day >= history.from && d.day <= history.to && d.questCount > 0).length);
  const days = history?.days ?? [];
  const units = [columnUnit(days.map(shopIncome)), columnUnit(days.map(d => d.sources.orders)), columnUnit(days.map(d => d.quests)), columnUnit(days.map(d => d.purchasing)), columnUnit(days.map(d => d.profit))];
  const tileUnit = kpis ? columnUnit([kpis.average, kpis.best.profit, kpis.worst.profit, kpis.averageQuests]) : 'gold';
  return <>
    <section className="flex flex-wrap items-end justify-between gap-3"><div><p className="type-eyebrow uppercase text-muted">History</p><h1 className="type-display mt-1">{history ? `Days ${history.from} to ${history.to}` : 'History'}</h1><p className="type-small text-muted mt-1">Quest Rewards included, as in the game's Daily Summary</p></div><RangePicker range={route.range} latestDay={meta.latestDay} onChange={(range, replace) => navigateRange({ ...route, range }, replace)} /></section>
    {!history || !kpis ? <Panel title="History">No completed days yet.</Panel> : <>
      <section aria-label="Range totals" className="kpi-grid">
        <StatTile label="Average Profit per day" copper={kpis.average} unit={tileUnit} caption={`quests included · Days ${history.from} to ${history.to}`} />
        <StatTile label="Best day" copper={kpis.best.profit} unit={tileUnit} caption={<a href={`#/today/${kpis.best.day}`}>Day {kpis.best.day}</a>} />
        <StatTile label="Worst day" copper={kpis.worst.profit} unit={tileUnit} caption={<a href={`#/today/${kpis.worst.day}`}>Day {kpis.worst.day}</a>} />
        <StatTile label="Average Quest Rewards per day" copper={kpis.averageQuests} unit={tileUnit} caption={`quests turned in on ${kpis.questDays} of ${days.length} days`} />
      </section>
      <Panel eyebrow="Income and spending" title="Money by day"><MoneyByDayChart days={days} /></Panel>
      <div className="history-grid"><Panel eyebrow="The same numbers" title={all || days.length <= 10 ? `All ${days.length} days` : 'Last 10 days'} padded={false} actions={days.length > 10 ? <Button size="sm" onClick={() => setAll(v => !v)}>{all ? 'Show last 10' : `Show all ${days.length}`}</Button> : undefined}>
        <div className="history-table" onClick={e => { const row = (e.target as HTMLElement).closest('tbody tr'); if (row) { const link = row.querySelector('a'); if (link) location.hash = link.hash; } }}>
          <LedgerTable caption="Shop Income, Order Income, Quest Rewards, Purchasing Cost and Profit by day" columns={[{ header: 'Day' }, ...['Shop Income', 'Order Income', 'Quest Rewards', 'Purchasing Cost', 'Profit'].map((header, i) => ({ header, align: 'end' as const, className: i < 3 ? 'history-secondary' : undefined }))]} rows={[...(all ? days : days.slice(-10))].reverse().map(d => [<a href={`#/today/${d.day}`} className="whitespace-nowrap">Day {d.day}</a>, ...[shopIncome(d), d.sources.orders, d.quests, -d.purchasing, d.profit].map((copper, i) => <Money copper={copper} unit={units[i]} />)])} />
        </div>
      </Panel><Heatmap history={history} /></div>
    </>}
    <PageNotes meta={meta} page="history" />
  </>;
}
