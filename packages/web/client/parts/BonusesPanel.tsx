import { Panel } from '@design/components';
import type { DayResponse } from '../../shared/api';
import { Swatch } from './summary';
export function BonusesPanel({ day }: { day: DayResponse }) {
  const pct = (n: number | null) => n === null ? '—' : `${n}%`;
  return <div id="bonuses"><Panel title={`Bonuses on Day ${day.day}`}><dl className="flex flex-wrap gap-x-6 gap-y-2 type-small">
    <div className="flex gap-2"><dt className="text-muted">Shop Profit</dt><dd>{pct(day.bonuses.shopProfit)}</dd></div>
    {Object.entries(day.bonuses.categories).map(([key, value]) => <div key={key} className="flex items-center gap-2"><Swatch series={key as keyof typeof day.bonuses.categories} /><dt className="text-muted">{key[0].toUpperCase() + key.slice(1)}</dt><dd>{pct(value)}</dd></div>)}
    <div className="flex gap-2"><dt className="text-muted">Order Income</dt><dd>{day.bonuses.orderIncomePct ? `+${day.bonuses.orderIncomePct}% (current)` : '—'}</dd></div>
    <div className="flex gap-2"><dt className="text-muted">Quest Rewards</dt><dd>{pct(day.bonuses.questRewards)} (current)</dd></div>
  </dl></Panel></div>;
}
