import type { FlagSettings } from '@af-ledger/core';

export type FlagSwitch = 'incomeFlags' | 'purchaseFlags';
export type FlagNumberKey = Exclude<keyof FlagSettings, FlagSwitch>;
export type FlagGroup = { id: 'usual' | 'shop' | 'purchases'; heading: string; switch?: FlagSwitch };
export const FLAG_GROUPS: FlagGroup[] = [
  { id: 'usual', heading: 'Usual' },
  { id: 'shop', heading: 'Shop Income and Order Income', switch: 'incomeFlags' },
  { id: 'purchases', heading: 'Purchasing Cost', switch: 'purchaseFlags' },
];
export type FlagField = {
  key: FlagNumberKey; group: FlagGroup['id']; before: string; after: string;
  unit: 'days' | 'percent' | 'times'; min: number; max: number;
  minOpen: boolean; maxOpen: boolean; integer: boolean;
};
export const FLAG_FIELDS: FlagField[] = [
  { key: 'windowDays', group: 'usual', before: 'Each day is compared with the median of the previous', after: 'days.', unit: 'days', min: 1, max: Infinity, minOpen: false, maxOpen: false, integer: true },
  { key: 'dropRatio', group: 'shop', before: 'Flag an item when its units fall to', after: 'of usual or less.', unit: 'percent', min: 0, max: 100, minOpen: true, maxOpen: true, integer: false },
  { key: 'moneyDropShare', group: 'shop', before: 'Or when its income falls by', after: 'or more of usual Earnings (Shop Income + Order Income).', unit: 'percent', min: 0, max: 100, minOpen: true, maxOpen: false, integer: false },
  { key: 'zeroRunDays', group: 'shop', before: 'Keep flagging a stopped item for its first', after: 'days at zero.', unit: 'days', min: 1, max: Infinity, minOpen: false, maxOpen: false, integer: true },
  { key: 'riseRatio', group: 'purchases', before: 'Flag a purchase when its units reach', after: 'usual or more.', unit: 'times', min: 1, max: Infinity, minOpen: true, maxOpen: false, integer: false },
  { key: 'purchaseShopShare', group: 'purchases', before: 'Or when its cost rises by', after: 'or more of usual Shop Income.', unit: 'percent', min: 0, max: 100, minOpen: true, maxOpen: false, integer: false },
];
export type FlagDraft = Record<FlagNumberKey, string> & Record<FlagSwitch, boolean>;
export type FlagErrors = Partial<Record<FlagNumberKey, string>>;
const displayValue = (field: FlagField, value: number) => field.unit === 'percent' ? Number((value * 100).toFixed(4)) : value;
export function toDraft(settings: FlagSettings): FlagDraft {
  const draft = { incomeFlags: settings.incomeFlags, purchaseFlags: settings.purchaseFlags } as FlagDraft;
  for (const field of FLAG_FIELDS) draft[field.key] = String(displayValue(field, settings[field.key]));
  return draft;
}
function parseField(field: FlagField, text: string): { value: number; error?: string } {
  const shown = Number(text);
  const value = field.unit === 'percent' ? Number((shown / 100).toFixed(6)) : shown;
  const valid = (n: number) => Number.isFinite(n) && (!field.integer || Number.isInteger(n)) &&
    (field.minOpen ? n > field.min : n >= field.min) && (field.maxOpen ? n < field.max : n <= field.max);
  // Check both the typed value and the rounded value sent to the server, so rounding can't push it past a limit.
  if (!text.trim() || !valid(shown) || !valid(field.unit === 'percent' ? value * 100 : value)) {
    const suffix = field.unit === 'percent' ? '%' : field.unit === 'times' ? '×' : '';
    return { value, error: `Enter ${field.integer ? 'a whole number' : 'a number'} ${field.minOpen ? 'greater than' : 'at least'} ${field.min}${suffix}${Number.isFinite(field.max) ? ` and ${field.maxOpen ? 'less than' : 'at most'} ${field.max}${suffix}` : ''}.` };
  }
  return { value };
}
export function parseDraft(draft: FlagDraft): { ok: true; settings: FlagSettings } | { ok: false; errors: FlagErrors } {
  const settings = { incomeFlags: draft.incomeFlags, purchaseFlags: draft.purchaseFlags } as FlagSettings;
  const errors: FlagErrors = {};
  for (const field of FLAG_FIELDS) {
    const parsed = parseField(field, draft[field.key]);
    if (parsed.error) errors[field.key] = parsed.error;
    settings[field.key] = parsed.value;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, settings };
}
export function setGroup(draft: FlagDraft, key: FlagSwitch, on: boolean, saved: FlagSettings): FlagDraft {
  const next = { ...draft, [key]: on };
  if (!on) {
    const group = FLAG_GROUPS.find(group => group.switch === key)!;
    const original = toDraft(saved);
    for (const field of FLAG_FIELDS.filter(field => field.group === group.id)) {
      if (parseField(field, draft[field.key]).error) next[field.key] = original[field.key];
    }
  }
  return next;
}
