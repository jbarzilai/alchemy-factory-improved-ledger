import { useEffect, useRef, useState } from 'react';
import { Button, columnUnit, Money } from '@design/components';
import { earlierEndIndex } from '../today';
import type { StripDay } from '../../shared/api';
import { routeHash, type DaySelection } from '../route';
export function DayStrip({ days, selected, items }: { days: StripDay[]; selected: number; items: DaySelection }) {
  const [end, setEnd] = useState(selected);
  const strip = useRef<HTMLDivElement>(null);
  const tile = useRef<HTMLAnchorElement>(null);
  useEffect(() => { setEnd(selected); }, [selected]);
  useEffect(() => {
    let active = true;
    const scroll = () => { if (active) tile.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' }); };
    scroll();
    const observer = new ResizeObserver(scroll);
    if (strip.current) observer.observe(strip.current);
    if (tile.current) observer.observe(tile.current);
    void document.fonts.ready.then(scroll);
    return () => { active = false; observer.disconnect(); };
  }, [selected, end, days]);
  const endIndex = Math.max(0, days.findIndex(d => d.day === end));
  const visible = days.slice(Math.max(0, endIndex - 13), endIndex + 1);
  const unit = columnUnit(visible.map(d => d.dailySummaryProfit));
  return <section aria-label="Recent days" className="flex min-w-0 gap-2">
    <Button aria-label="Earlier days" disabled={endIndex < 14} onClick={() => setEnd(days[earlierEndIndex(endIndex)].day)}>←</Button>
    <div className="min-w-0 flex-1 overflow-x-auto"><div ref={strip} className="strip-tiles">{visible.map(d => <a key={d.day} ref={d.day === selected ? tile : undefined} href={routeHash({ page: 'today', day: d.day, items })} aria-current={d.day === selected ? 'date' : undefined} className={`strip-tile relative flex flex-col items-center rounded-lg border px-2 py-2 pb-6 text-center ${d.day === selected ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-panel text-ink hover:bg-raised'}`}>
      <span className="type-label text-muted">Day {d.day}</span><span className="type-heading"><Money copper={d.dailySummaryProfit} unit={unit} /></span>
      {d.questCount > 0 && <span className="absolute bottom-1 left-1.5 type-micro text-muted" title="Quests submitted"><span aria-hidden="true" className="inline-block size-1.5 rounded-xs bg-quests" /> Q</span>}
      {d.flagCount > 0 && <svg role="img" aria-label="has flags" viewBox="0 0 16 16" className="absolute bottom-1 right-1.5 size-3 text-loss" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3.5 15V1.5M3.5 2H13l-2.25 3.25L13 8.5H3.5" /></svg>}
    </a>)}</div></div>
    <Button aria-label="Later days" disabled={endIndex === days.length - 1} onClick={() => setEnd(days[Math.min(days.length - 1, endIndex + 14)].day)}>→</Button>
  </section>;
}
