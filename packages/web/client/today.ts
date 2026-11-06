/** Paging the day strip back moves 14 days, but stops at the first 14 tiles so the strip stays full. */
export const earlierEndIndex = (endIndex: number) => Math.max(13, endIndex - 14);

export function moneyChange(change: number, money: { text: string; suffix: string }, expense = false) {
  const flat = !/[1-9]/.test(money.text);
  const color = flat ? 'text-muted' : (expense ? change < 0 : change > 0) ? 'text-gain' : 'text-loss';
  return { ...money, arrow: flat ? '' : change > 0 ? '↑' : '↓', color };
}

export const percentSetting = (ratio: number) => `${Number((ratio * 100).toFixed(1))}%`;
export const questCount = (count: number) => `${count} ${count === 1 ? 'quest' : 'quests'}`;
