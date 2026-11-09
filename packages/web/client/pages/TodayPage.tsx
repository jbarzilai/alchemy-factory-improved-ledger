import { useState } from 'react';
import { Button, Notice } from '@design/components';
import type { DayResponse, MetaResponse } from '../../shared/api';
import { DayStrip } from '../parts/DayStrip';
import { SumBlock } from '../parts/SumBlock';
import { CategoryTable } from '../parts/CategoryTable';
import { effectiveSelection } from '../dayItems';
import { DayItems } from '../parts/DayItems';
import { routeHash, type Route, type DaySelection } from '../route';
import { navigateRange } from '../navigation';
import { QuestBox } from '../parts/QuestBox';
import { FlagList } from '../parts/FlagList';
import { BonusesPanel } from '../parts/BonusesPanel';
import { PageNotes } from '../parts/PageNotes';
export function TodayPage({ meta, day, route, onCustomizeFlags }: { meta: MetaResponse; day: DayResponse; route: Extract<Route, { page: 'today' }>; onCustomizeFlags: () => void }) {
  const [bonusesOpen, setBonusesOpen] = useState(false);
  const selection = effectiveSelection(day, route.items);
  const onChange = (items: DaySelection) => navigateRange({ ...route, items }, true);
  function go(n: number) { location.hash = routeHash({ ...route, day: n }); }
  // The API also supplies the quest-bonus disclaimer; that belongs in PageNotes.
  const notices = day.notices.filter(note => !note.startsWith("Quest rewards use the save's current Quest Rewards bonus"));
  return <>
    <DayStrip days={meta.days} selected={day.day} items={route.items} />
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3"><div>
        <p className="type-eyebrow uppercase text-muted">{day.day === meta.latestDay ? 'Latest completed day' : 'Completed day'}</p>
        <h1 className="type-display mt-1">Day {day.day}</h1>
        <p className="type-small text-muted mt-1">{day.previousDay === null ? 'No previous completed day.' : `Changes are against Day ${day.previousDay}`}</p>
      </div><div className="flex flex-wrap items-center gap-2">
        <Button aria-expanded={bonusesOpen} aria-controls={bonusesOpen ? 'bonuses' : undefined} onClick={() => setBonusesOpen(v => !v)}>Bonuses</Button>
        <Button disabled={day.day <= meta.firstDay} onClick={() => go(day.day - 1)}>← Day {day.day - 1}</Button>
        <Button disabled={day.day >= meta.latestDay} onClick={() => go(day.day + 1)}>Day {day.day + 1} →</Button>
      </div></div>
      {bonusesOpen && <BonusesPanel day={day} />}
    </section>
    <div className="today-grid"><div className="flex min-w-0 flex-col gap-6">
      <SumBlock day={day} selection={selection} onChange={onChange} />
      {notices.map(note => <Notice key={note} tone="missing">{note}</Notice>)}
      <CategoryTable day={day} selection={selection} onChange={onChange} />
      <DayItems day={day} meta={meta} selection={selection} onChange={onChange} />
    </div><div className="flex min-w-0 flex-col gap-6"><QuestBox day={day} /><FlagList day={day} meta={meta} route={{ ...route, items: selection }} onCustomizeFlags={onCustomizeFlags} /></div></div>
    <PageNotes meta={meta} day={day} coins={day.showCoins} />
  </>;
}
