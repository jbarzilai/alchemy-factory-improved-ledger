import { afterAll, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, loadSettings, loadBaseSettings, validateFlagSettings, flagOverrides, LOCAL_FLAGS_FILE } from '../src/settings';
import { REPO } from './helpers/fixture';

mkdirSync(path.join(REPO, '.cache'), { recursive: true });
const dir = mkdtempSync(path.join(REPO, '.cache/test-settings-'));
let sequence = 0;
const fileWith = (value: unknown, raw = false) => {
  const file = path.join(dir, `${sequence++}.json`);
  writeFileSync(file, raw ? String(value) : JSON.stringify(value));
  return file;
};
afterAll(() => rmSync(dir, { recursive: true, force: true }));
it('reads the committed file as DEFAULT_SETTINGS', () => {
  expect(loadBaseSettings()).toEqual(DEFAULT_SETTINGS);
});
it('defaults missing files, sections and keys, returning independent objects', () => {
  for (const file of [path.join(dir, 'missing.json'), fileWith({})]) expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS);
  const result = loadSettings(fileWith({ web: { port: 5000 } }));
  expect(result).toEqual({ ...DEFAULT_SETTINGS, web: { ...DEFAULT_SETTINGS.web, port: 5000 } });
  result.flags.windowDays = 99;
  expect(DEFAULT_SETTINGS.flags.windowDays).toBe(3);
});
it('ignores underscore-prefixed keys at every level', () => {
  expect(loadSettings(fileWith({ _anything: { bad: true }, web: { _comment: [] }, flags: { _comment: null } }))).toEqual(DEFAULT_SETTINGS);
});
const invalid: [string, string, unknown[], string][] = [
  ['web', 'port', [0, 65536, 1.5, '4317', null, true], 'an integer 1–65535'],
  ['web', 'host', ['', '  ', 123, null, false], 'a non-empty string'],
  ['web', 'watchIntervalMs', [499, 500.5, '3000', null], 'an integer ≥ 500'],
  ['flags', 'incomeFlags', ['false', 0, 1, null], 'true or false'],
  ['flags', 'purchaseFlags', ['true', 0, 1, null], 'true or false'],
  ['flags', 'windowDays', [0, -1, 1.5, '3', null], 'an integer ≥ 1'],
  ['flags', 'zeroRunDays', [0, -1, 1.5, '3', null], 'an integer ≥ 1'],
  ['flags', 'dropRatio', [0, 1, -0.5, '0.5', null], 'in (0, 1)'],
  ['flags', 'riseRatio', [1, 0, -2, '2', null], '> 1'],
  ['flags', 'purchaseShopShare', [0, -0.1, 1.1, '0.1', null], 'in (0, 1]'],
  ['flags', 'moneyDropShare', [0, -0.1, 1.1, '0.1', null], 'in (0, 1]'],
];
for (const [section, key, values, rule] of invalid) {
  it.each(values)(`rejects ${section}.${key} = %j`, value => {
    const file = fileWith({ [section]: { [key]: value } });
    expect(() => loadSettings(file)).toThrow(`${file}: ${section}.${key} must be ${rule}`);
  });
}
it('accepts boundary values and custom settings', () => {
  const settings = { web: { port: 65535, host: '127.0.0.1', watchIntervalMs: 500 },
    flags: { incomeFlags: true, purchaseFlags: true, windowDays: 1, zeroRunDays: 1, dropRatio: 0.01, riseRatio: 1.01, moneyDropShare: 1, purchaseShopShare: 1 } };
  expect(loadSettings(fileWith(settings))).toEqual(settings);
  expect(loadSettings(fileWith({ web: { port: 1 } })).web.port).toBe(1);
});
it.each([{ flags: { dropratio: 0.5 } }, { typo: {} }, { web: { typo: true } }])('rejects unknown settings %j', value => {
  const file = fileWith(value);
  const key = 'flags' in value ? 'flags.dropratio' : 'web' in value ? 'web.typo' : 'typo';
  expect(() => loadSettings(file)).toThrow(`${file}: unknown setting ${key}`);
});
it('rejects malformed JSON', () => {
  const file = fileWith('{', true);
  expect(() => loadSettings(file)).toThrow(`${file}: not valid JSON`);
});
it.each([null, [], 3])('rejects a non-object document %j', value => {
  const file = fileWith(value);
  expect(() => loadSettings(file)).toThrow(`${file}: settings must be an object`);
});
it.each([null, [], 3])('rejects a non-object section %j', value => {
  const file = fileWith({ flags: value });
  expect(() => loadSettings(file)).toThrow(`${file}: flags must be an object`);
});

it('overlays only local flags, while base settings ignore the sibling', () => {
  const folder = mkdtempSync(path.join(dir, 'local-'));
  const base = path.join(folder, 'settings.json');
  const local = path.join(folder, LOCAL_FLAGS_FILE);
  writeFileSync(base, JSON.stringify({ flags: { riseRatio: 4 } }));
  expect(loadSettings(base)).toEqual(loadBaseSettings(base));
  writeFileSync(local, JSON.stringify({ purchaseFlags: false, riseRatio: 3 }));
  expect(loadSettings(base).flags).toEqual({ ...DEFAULT_SETTINGS.flags, purchaseFlags: false, riseRatio: 3 });
  expect(loadBaseSettings(base).flags.riseRatio).toBe(4);
  for (const [value, error] of [
    ['{', 'not valid JSON'], ['{"riseRatio":1}', 'flags.riseRatio must be > 1'],
    ['{"typo":2}', 'unknown setting flags.typo'], ['{"web":{}}', 'unknown setting flags.web'],
  ]) {
    writeFileSync(local, value);
    expect(() => loadSettings(base)).toThrow(`${local}: ${error}`);
  }
});
it('validates full flag settings with no missing or extra keys', () => {
  const flags = DEFAULT_SETTINGS.flags;
  expect(validateFlagSettings(flags, 'body')).toEqual(flags);
  for (const key of Object.keys(flags)) {
    const partial = { ...flags } as Record<string, unknown>; delete partial[key];
    expect(() => validateFlagSettings(partial, 'body')).toThrow(`body: flags.${key}`);
  }
  expect(() => validateFlagSettings({ ...flags, typo: 1 }, 'body')).toThrow('body: unknown setting flags.typo');
  expect(() => validateFlagSettings({ ...flags, _comment: 1 }, 'body')).toThrow('body: unknown setting flags._comment');
  for (const [section, key, values, rule] of invalid) if (section === 'flags') {
    for (const value of values) expect(() => validateFlagSettings({ ...flags, [key]: value }, 'body'))
      .toThrow(`body: flags.${key} must be ${rule}`);
  }
  for (const value of [null, [], 1, 'flags']) expect(() => validateFlagSettings(value, 'body')).toThrow('body:');
});
it('stores only differences from base flags', () => {
  const d = DEFAULT_SETTINGS.flags;
  expect(flagOverrides({ ...d, riseRatio: 3 }, d)).toEqual({ riseRatio: 3 });
  expect(flagOverrides({ ...d, purchaseFlags: false }, d)).toEqual({ purchaseFlags: false });
  expect(flagOverrides(d, d)).toEqual({});
});
