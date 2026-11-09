import { columnUnit, formatMoney, Panel } from '@design/components';
import type { HistoryResponse } from '../../shared/api';
import { heatCells } from '../economics';
const strengths = [18, 34, 52, 72, 95];
export function Heatmap({ history }: { history: HistoryResponse }) {
  const cells = heatCells(history.allDays, history.events);
  const unit = columnUnit(history.allDays.map(d => d.dailySummaryProfit));
  return <Panel eyebrow="Whole save" title={`Daily Profit, Days ${history.allDays[0]?.day ?? 1} to ${history.allDays.at(-1)?.day ?? 1}`}>
    <div className="profit-heatmap" aria-label="Daily Profit with quests; ringed days mark events">
      {cells.map(cell => {
        const value = formatMoney(cell.dailySummaryProfit, unit);
        const title = `Day ${cell.day}: ${value.text}${value.suffix}${cell.events.length ? ' · ' + cell.events.map(e => e.text).join('; ') : ''}`;
        return <a key={cell.day} href={`#/today/${cell.day}`} title={title} aria-label={title} className={`heat-cell${cell.events.length ? ' event-day' : ''}`} style={{ gridRow: cell.row + 1, gridColumn: cell.column + 1, background: cell.level < 0 ? 'var(--loss)' : `color-mix(in srgb, var(--accent) ${strengths[cell.level]}%, var(--panel))` }} />;
      })}
    </div>
    <div className="type-micro text-muted flex flex-wrap items-center gap-2 mt-3"><span className="heat-key bg-loss" />loss<span>0</span>{strengths.map(s => <span key={s} className="heat-key" style={{ background: `color-mix(in srgb, var(--accent) ${s}%, var(--panel))` }} />)}<span>80g+</span><span>Rows of 20 days</span></div>
    <ul className="flex flex-col gap-2 mt-4 type-small">{history.events.map((event, i) => <li key={i}><a href={`#/today/${event.day}`} className="event-link flex gap-2 items-baseline"><span className="text-muted whitespace-nowrap">Day {event.day}</span><span className="type-micro text-violet bg-raised rounded-xs px-1 whitespace-nowrap">{event.kind === 'order-income' ? 'Order Income' : event.kind === 'bonus' || event.kind === 'shop-profit' ? 'Bonus' : 'Item'}</span><span className="min-w-0">{event.text}</span></a></li>)}</ul>
  </Panel>;
}
