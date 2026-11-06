import { formatMoney, Panel } from '@design/components';
import type { ItemsResponse } from '../../shared/api';
import { moverChange, selectMovers } from '../economics';
export function MoversList({ data, onSelect }: { data: ItemsResponse; onSelect: (item: string) => void }) {
  const movers = selectMovers(data.movers, data.to - data.from + 1);
  const split = data.from + Math.floor((data.to - data.from + 1) / 2);
  const gold = (n: number, signed = false) => { const v = formatMoney(n, 'gold', signed); return v.text + v.suffix; };
  return <Panel eyebrow={split > data.from ? `Days ${data.from}–${split - 1} vs ${split}–${data.to}` : 'No earlier half to compare'} title="Rising and falling">
    {split <= data.from ? <p className="type-small text-muted">Pick at least 2 days to compare halves.</p> : (['falling', 'rising'] as const).map(group => <section key={group} className="mt-3"><h3 className="type-heading">{group === 'falling' ? 'Falling' : 'Rising'}</h3>
      {!movers[group].length && <p className="type-small text-muted mt-2">No {group} items in this range.</p>}
      {movers[group].map(m => <button key={m.item} onClick={() => onSelect(m.item)} className="mover-row text-start w-full flex flex-wrap items-center justify-between gap-2 py-2 border-t border-line">
        <span className="min-w-0"><span className="block type-body">{m.name}</span><span className="block type-micro text-muted">{gold(m.firstPerDay)} → {gold(m.secondPerDay)} a day · share {(m.firstShare * 100).toFixed(1)}% → {(m.secondShare * 100).toFixed(1)}%</span></span>
        <span className={`type-micro whitespace-nowrap rounded-xs px-1 ${group === 'falling' ? 'bg-loss-soft text-loss' : 'bg-gain-soft text-gain'}`}>{group === 'falling' ? '↓' : '↑'} {gold(moverChange(m), true)} a day</span>
      </button>)}
    </section>)}
  </Panel>;
}
