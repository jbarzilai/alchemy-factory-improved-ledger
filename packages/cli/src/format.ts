// Pure terminal formatting. Amounts enter as copper-equivalent values.
export type Unit = 'mixed' | 'gold' | 'silver' | 'copper';

export const oneLine = (text: string): string => text.replace(/[\r\n]+/g, ' ');

export { questLabel } from '@af-ledger/core';

export function money(copper: number, unit: Exclude<Unit, 'mixed'>): string {
  if (unit === 'copper') return `${(Math.round(copper) || 0).toLocaleString('en-US')}c`;
  const value = copper / (unit === 'gold' ? 100_000 : 1_000);
  return `${unsignedZero(value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}${unit === 'gold' ? 'g' : 's'}`;
}

export const UNIT_THRESHOLD = 10;

export function reportUnit(scale: number, unit: Unit, threshold = UNIT_THRESHOLD): Exclude<Unit, 'mixed'> {
  if (unit !== 'mixed') return unit;
  return Math.abs(scale) >= threshold * 100_000 ? 'gold' : Math.abs(scale) >= threshold * 1_000 ? 'silver' : 'copper';
}

// Each unit price uses the largest denomination worth at least one of that coin.
export function priceText(copper: number, unit: Unit): string {
  return money(copper, reportUnit(Math.round(copper), unit, 1));
}

const unsignedZero = (text: string): string => Number(text.replace(/,/g, '')) === 0 ? text.replace(/^-/, '') : text;
export const percentage = (value: number): string => `${unsignedZero(value.toFixed(1))}%`;
export function signed(value: number, show: (value: number) => string): string {
  const text = show(value);
  return `${value > 0 && Number.parseFloat(text.replace(/,/g, '')) !== 0 ? '+' : ''}${text}`;
}

export const colorEnabled = (tty: boolean, env: NodeJS.ProcessEnv): boolean => tty && !env.NO_COLOR;

export function table(rows: string[][], align: ('l' | 'r')[]): string {
  const widths = align.map((_, col) => Math.max(0, ...rows.map((row) => (row[col] ?? '').length)));
  return rows.map((row) => align.map((side, col) => {
    const cell = row[col] ?? '';
    return side === 'r' ? cell.padStart(widths[col]) : cell.padEnd(widths[col]);
  }).join('  ').trimEnd()).join('\n');
}

export function bar(fraction: number, width = 20): string {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function delta(cur: number, prev: number | null): { diff: number | null; pct: number | null } {
  return {
    diff: prev === null ? null : cur - prev,
    pct: prev === null || prev === 0 ? null : (cur - prev) / Math.abs(prev) * 100,
  };
}
