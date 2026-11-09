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
  const columns = [
    { label: 'Shop Income', value: shopIncome, secondary: true },
    { label: 'Order Income', value: (d: HistoryResponse['days'][number]) => d.sources.orders, secondary: true },
    { label: 'Quest Rewards', value: (d: HistoryResponse['days'][number]) => d.quests, secondary: true },
    ...(history?.showCoins ? [{ label: 'Coins Minted', value: (d: HistoryResponse['days'][number]) => d.minted, secondary: true }] : []),
    { label: 'Purchasing Cost', value: (d: HistoryResponse['days'][number]) => -d.purchasing, secondary: false },
    ...(history?.showCoins ? [{ label: 'Coins Melted', value: (d: HistoryResponse['days'][number]) => -d.melted, secondary: false }] : []),
    { label: 'Profit', value: (d: HistoryResponse['days'][number]) => d.profit, secondary: false },
  ];
  const units = columns.map(c => columnUnit(days.map(c.value)));
  const tileUnit = kpis ? columnUnit([kpis.average, kpis.best.profit, kpis.worst.profit, kpis.averageQuests]) : 'gold';
  return <>
    <section className="flex flex-wrap items-end justify-between gap-3"><div><p className="type-eyebrow uppercase text-muted">History</p><h1 className="type-display mt-1">{history ? `Days ${history.from} to ${history.to}` : 'History'}</h1><p className="type-small text-muted mt-1">Quest Rewards and coins included, as in the game's Ledger tab</p></div><RangePicker range={route.range} latestDay={meta.latestDay} onChange={(range, replace) => navigateRange({ ...route, range }, replace)} /></section>
    {!history || !kpis ? <Panel title="History">No completed days yet.</Panel> : <>
      <section aria-label="Range totals" className="kpi-grid">
        <StatTile label="Average Profit per day" copper={kpis.average} unit={tileUnit} caption={`quests and coins included · Days ${history.from} to ${history.to}`} />
        <StatTile label="Best day" copper={kpis.best.profit} unit={tileUnit} caption={<a href={`#/today/${kpis.best.day}`}>Day {kpis.best.day}</a>} />
        <StatTile label="Worst day" copper={kpis.worst.profit} unit={tileUnit} caption={<a href={`#/today/${kpis.worst.day}`}>Day {kpis.worst.day}</a>} />
        <StatTile label="Average Quest Rewards per day" copper={kpis.averageQuests} unit={tileUnit} caption={`quests turned in on ${kpis.questDays} of ${days.length} days`} />
      </section>
      <Panel eyebrow="Income and spending" title="Money by day"><MoneyByDayChart days={days} showCoins={history.showCoins} /></Panel>
      <div className="history-grid"><Panel eyebrow="The same numbers" title={all || days.length <= 10 ? `All ${days.length} days` : 'Last 10 days'} padded={false} actions={days.length > 10 ? <Button size="sm" onClick={() => setAll(v => !v)}>{all ? 'Show last 10' : `Show all ${days.length}`}</Button> : undefined}>
        <div className="history-table" onClick={e => { const row = (e.target as HTMLElement).closest('tbody tr'); if (row) { const link = row.querySelector('a'); if (link) location.hash = link.hash; } }}>
          <LedgerTable caption={`${columns.map(c => c.label).slice(0, -1).join(', ')} and Profit by day`} columns={[{ header: 'Day' }, ...columns.map(c => ({ header: c.label, align: 'end' as const, className: c.secondary ? 'history-secondary' : undefined }))]} rows={[...(all ? days : days.slice(-10))].reverse().map(d => [<a href={`#/today/${d.day}`} className="whitespace-nowrap">Day {d.day}</a>, ...columns.map((c, i) => <Money copper={c.value(d)} unit={units[i]} />)])} />
        </div>
      </Panel><Heatmap history={history} /></div>
    </>}
    <PageNotes meta={meta} page="history" coins={history?.showCoins} />
  </>;
}
