import { useEffect, useReducer } from 'react';
import { SERIES, type SeriesKey } from '@design/components';
export const cssColor = (token: string): string => getComputedStyle(document.documentElement).getPropertyValue(token).trim();
export const seriesColor = (key: SeriesKey): string => cssColor(SERIES.find(s => s.key === key)!.token);
export function useChartTheme() {
  const [revision, refresh] = useReducer(n => n + 1, 0);
  useEffect(() => {
    const observer = new MutationObserver(() => refresh());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => observer.disconnect();
  }, []);
  return revision;
}
