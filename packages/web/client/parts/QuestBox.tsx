import { columnUnit, DeltaChip, Money, Panel } from '@design/components';
import { questCount } from '../today';
import type { DayResponse } from '../../shared/api';
export function QuestBox({ day }: { day: DayResponse }) {
  const { quests, previousTotals: previous } = day;
  const unit = columnUnit([quests.copper, previous?.quests ?? 0, ...quests.lines.map(l => l.copper)], 'gold');
  return <Panel title="Quest Rewards"><div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-baseline gap-2"><span className="type-kpi">{day.totals.questCount > 0 && <span className="text-violet" title="Computed, not read from the save">≈ </span>}<Money copper={quests.copper} unit={unit} /></span>
      {previous && <DeltaChip change={quests.copper - previous.quests} base={previous.quests} unit={unit} />}</div>
    <div className="flex flex-col gap-1 type-small">{quests.lines.map((line, i) => <div key={i} className="flex justify-between gap-2"><span className="text-muted">{line.label}</span><Money copper={line.copper} unit={unit} /></div>)}
      {day.totals.questCount === 0 && <p className="text-muted">No quests turned in.</p>}
    </div>
    {previous && <div className="type-small flex flex-wrap justify-between gap-2 border-t border-line pt-3 text-muted"><span>Day {day.previousDay}</span><span>{previous.questCount ? <><Money copper={previous.quests} unit={unit} /> from {questCount(previous.questCount)}</> : 'none'}</span></div>}
  </div></Panel>;
}
