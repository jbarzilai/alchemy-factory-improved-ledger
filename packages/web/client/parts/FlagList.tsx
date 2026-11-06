import { SettingsMenu } from './SettingsMenu';
import { columnUnit, DeltaChip, ItemLabel, Panel, SERIES } from '@design/components';
import type { DayResponse, MetaResponse } from '../../shared/api';
import { expandedItem, flagKindLabel, flagSelection, noFlagsText } from '../dayItems';
import { routeHash, type Route } from '../route';
export function FlagList({ day, meta, route, onCustomizeFlags }: { day: DayResponse; meta: MetaResponse; route: Extract<Route, { page: 'today' }>; onCustomizeFlags: () => void }) {
  const unit = columnUnit(day.flags.flatMap(f => f.impact === null ? [] : [f.impact]));
  return <Panel title="Flags" eyebrow="Worth a look in game" padded={false} actions={<div className="flex items-center gap-2"><SettingsMenu onCustomizeFlags={onCustomizeFlags} /><span className="type-micro rounded-full bg-raised px-2">{day.flags.length}</span></div>}>
    {!day.flags.length ? <p className="p-4 text-muted">{noFlagsText(day.day, meta.settings)}</p> : <ul>{day.flags.map(flag => {
      const kind = flagKindLabel(flag, meta.settings);
      const selected = route.items.stream === flag.stream && expandedItem(day, route.items) === flag.item;
      const stream = flag.stream === 'shop' ? 'Shop Income' : flag.stream === 'orders' ? 'Order Income' : 'Purchasing Cost';
      const change = flag.today - flag.usual;
      const series = SERIES.find(s => s.key === flag.category)?.key;
      return <li key={`${flag.stream}-${flag.item}`} className="border-t border-line"><a href={routeHash({ ...route, items: flagSelection(flag) })} aria-current={selected ? "true" : undefined} className={`flex flex-col gap-2 p-4 hover:bg-raised ${selected ? 'bg-accent-soft' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><ItemLabel name={flag.name} series={series} iconSrc={meta.iconItems.includes(flag.item) ? `/api/icon/${encodeURIComponent(flag.item)}` : undefined} />{flag.impact !== null && <DeltaChip change={flag.impact} unit={unit} />}</div>
        <p className="type-small text-muted">{stream}{series ? ` · ${SERIES.find(s => s.key === series)!.label}` : ''} · {kind}</p>
        <p className="type-small">{flag.today} today · usual {flag.usual} · <span className={change === 0 ? 'text-muted' : 'text-loss'}>{change > 0 ? '↑ +' : change < 0 ? '↓ −' : ''}{Math.abs(change)}{flag.usual ? ` (${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change / flag.usual * 100).toFixed(0)}%)` : ''}</span></p>
      </a></li>;
    })}</ul>}
  </Panel>;
}
