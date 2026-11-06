import { useEffect, useRef, useState } from 'react';
import { SegmentedControl } from '@design/components';
import type { Range } from '../route';
import { rangeDays } from '../route';
import { customRange, rangeCommit } from '../economics';
export function RangePicker({ range, latestDay, onChange }: { range: Range; latestDay: number; onChange: (range: Range, replace?: boolean) => void }) {
  const preset = 'last' in range && (range.last === 3 || range.last === 7) ? String(range.last) : 'custom';
  const [custom, setCustom] = useState(preset === 'custom');
  const [mode, setMode] = useState<'last' | 'days'>('last' in range ? 'last' : 'days');
  const [last, setLast] = useState('last' in range ? String(range.last) : '30');
  const resolved = rangeDays(range, latestDay);
  const [from, setFrom] = useState(String(resolved?.from ?? 1)), [to, setTo] = useState(String(resolved?.to ?? 1));
  const rangeKey = JSON.stringify(range);
  const committed = useRef(range);
  useEffect(() => {
    committed.current = range;
    if (preset === 'custom') setCustom(true);
    setMode('last' in range ? 'last' : 'days');
    if ('last' in range) setLast(String(range.last));
    if (resolved) { setFrom(String(resolved.from)); setTo(String(resolved.to)); }
  }, [rangeKey, latestDay]);
  function update(which: 'last' | 'from' | 'to', value: string) {
    if (which === 'last') setLast(value); else if (which === 'from') setFrom(value); else setTo(value);
    const nextMode = which === 'last' ? 'last' : 'days';
    setMode(nextMode);
  }
  function commit() {
    const next = rangeCommit(committed.current, mode, last, from, to);
    if (next) { committed.current = next; onChange(next, true); }
  }
  const valid = customRange(mode, last, from, to) !== null;
  return <div className="flex flex-col gap-2 items-start sm:items-end">
    <SegmentedControl label="Range" value={custom ? 'custom' : preset} options={[{ value: '3', label: '3 days' }, { value: '7', label: '7 days' }, { value: 'custom', label: 'Custom' }]} onChange={v => { setCustom(v === 'custom'); if (v !== 'custom') onChange({ last: Number(v) }); }} />
    {custom && <div className="range-inputs flex flex-wrap items-center gap-2 type-small text-muted" onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}>
      <label>Last <input aria-label="Number of days" type="number" min="1" value={last} onChange={e => update('last', e.target.value)} /> days</label><span>or</span>
      <label>Day <input aria-label="From day" type="number" min="1" max={latestDay || undefined} value={from} onChange={e => update('from', e.target.value)} /></label>
      <label>to <input aria-label="To day" type="number" min="1" max={latestDay || undefined} value={to} onChange={e => update('to', e.target.value)} /></label>
      {!valid && <p role="status" className="w-full">Enter positive whole days, with the first day no later than the last.</p>}
    </div>}
  </div>;
}
