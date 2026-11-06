import { describe, expect, it, vi, afterEach } from 'vitest';
import { DEFAULT_FLAG_SETTINGS, validateFlagSettings, type FlagSettings } from '@af-ledger/core';
import { FLAG_FIELDS, FLAG_GROUPS, parseDraft, setGroup, toDraft, type FlagNumberKey } from '../client/flagSettings';
import { ApiError, putFlagSettings } from '../client/api';
const defaults = DEFAULT_FLAG_SETTINGS;
function accepted(settings: FlagSettings) {
  try { validateFlagSettings(settings, 'test'); return true; } catch { return false; }
}
describe('flag drafts', () => {
  it('uses display units and both switches', () => {
    expect(toDraft(defaults)).toEqual({ windowDays: '3', dropRatio: '50', moneyDropShare: '10', zeroRunDays: '3', riseRatio: '2', purchaseShopShare: '7.5', incomeFlags: true, purchaseFlags: true });
  });
  it('round-trips defaults, fractional percents and switches exactly', () => {
    for (const share of [defaults.purchaseShopShare, 0.141, 0.07, 0.001, 1]) {
      for (const switches of [{}, { incomeFlags: false }, { purchaseFlags: false }]) {
        const s = { ...defaults, moneyDropShare: share, purchaseShopShare: share, ...switches };
        expect(parseDraft(toDraft(s))).toEqual({ ok: true, settings: s });
      }
    }
    expect(parseDraft(toDraft(defaults))).toEqual({ ok: true, settings: defaults });
  });
  for (const key of ['windowDays', 'dropRatio', 'moneyDropShare', 'zeroRunDays', 'riseRatio', 'purchaseShopShare'] as FlagNumberKey[]) {
    for (const value of ['', '   ', 'abc', '1e999', '-1', '0', ...(['windowDays', 'zeroRunDays'].includes(key) ? ['2.5'] : []), ...(key === 'dropRatio' ? ['100'] : []), ...(['moneyDropShare', 'purchaseShopShare'].includes(key) ? ['100.1'] : []), ...(key === 'riseRatio' ? ['1'] : [])]) {
      it(`rejects ${key}=${JSON.stringify(value)} on that field only`, () => {
        const result = parseDraft({ ...toDraft(defaults), [key]: value });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(Object.keys(result.errors)).toEqual([key]);
      });
    }
  }
  it('accepts 100 percent for either share', () => {
    expect(parseDraft({ ...toDraft(defaults), moneyDropShare: '100', purchaseShopShare: '100' })).toEqual({ ok: true, settings: { ...defaults, moneyDropShare: 1, purchaseShopShare: 1 } });
  });
  it('switches purchases off, repairs only invalid purchase numbers, and saves valid edits', () => {
    const saved = { ...defaults, purchaseShopShare: 0.141 };
    const draft = { ...toDraft(saved), riseRatio: '3', purchaseShopShare: '0' };
    const off = setGroup(draft, 'purchaseFlags', false, saved);
    expect(off).toEqual({ ...draft, purchaseFlags: false, purchaseShopShare: '14.1' });
    expect(draft.purchaseShopShare).toBe('0');
    expect(parseDraft(off)).toEqual({ ok: true, settings: { ...saved, riseRatio: 3, purchaseFlags: false } });
    expect(setGroup({ ...draft, windowDays: '' }, 'purchaseFlags', false, saved).windowDays).toBe('');
    expect(setGroup(draft, 'purchaseFlags', true, saved)).toEqual(draft);
  });
  it('switches income off, repairing each invalid row and retaining valid edits', () => {
    const saved = { ...defaults, dropRatio: 0.07, zeroRunDays: 5 };
    const draft = { ...toDraft(saved), dropRatio: '100', moneyDropShare: '14.1', zeroRunDays: '2.5' };
    const off = setGroup(draft, 'incomeFlags', false, saved);
    expect(off).toEqual({ ...draft, incomeFlags: false, dropRatio: '7', zeroRunDays: '5' });
    expect(parseDraft(off)).toEqual({ ok: true, settings: { ...saved, incomeFlags: false, moneyDropShare: 0.141 } });
    expect(setGroup({ ...draft, riseRatio: '' }, 'incomeFlags', false, saved).riseRatio).toBe('');
    expect(setGroup(draft, 'incomeFlags', true, saved)).toEqual(draft);
  });
  it('keeps Reset defaults when either group is switched off', () => {
    for (const key of ['incomeFlags', 'purchaseFlags'] as const) {
      expect(parseDraft(setGroup(toDraft(defaults), key, false, { ...defaults, riseRatio: 4 }))).toEqual({ ok: true, settings: { ...defaults, [key]: false } });
    }
  });
  it('covers every number and switch exactly once', () => {
    expect(FLAG_FIELDS.map(f => f.key).sort()).toEqual(Object.keys(defaults).filter(k => typeof defaults[k as keyof FlagSettings] === 'number').sort());
    expect(FLAG_GROUPS.flatMap(g => g.switch ? [g.switch] : []).sort()).toEqual(['incomeFlags', 'purchaseFlags']);
  });
  it('matches core validation just inside, on, and outside every bound', () => {
    for (const field of FLAG_FIELDS) {
      const step = field.integer ? 1 : 0.01;
      const values = [field.min - step, field.min, field.min + step, ...(Number.isFinite(field.max) ? [field.max - step, field.max, field.max + step] : [1e10, Infinity]), ...(field.integer ? [field.min + 0.5] : [])];
      for (const value of values) {
        const settings = { ...defaults, [field.key]: field.unit === 'percent' ? Number((value / 100).toFixed(6)) : value };
        expect(parseDraft({ ...toDraft(defaults), [field.key]: String(value) }).ok, `${field.key} ${value}`).toBe(accepted(settings));
      }
    }
  });
});
afterEach(() => vi.unstubAllGlobals());
it('PUT sends the full form including off groups', async () => {
  const settings = { ...defaults, purchaseFlags: false, riseRatio: 3 };
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ settings })));
  vi.stubGlobal('fetch', fetcher);
  expect(await putFlagSettings(settings)).toEqual({ settings });
  expect(fetcher).toHaveBeenCalledWith('/api/settings/flags', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
});
it.each([400, 403, 500])('PUT preserves server error for status %s', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'cannot save settings' }), { status })));
  await expect(putFlagSettings(defaults)).rejects.toEqual(new ApiError('cannot save settings', status));
});
