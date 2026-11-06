import { renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defaultConfigDir, flagOverrides, loadBaseSettings, LOCAL_FLAGS_FILE, type FlagSettings } from '@af-ledger/core';

export type FlagStore = { defaults: FlagSettings; save(flags: FlagSettings): void };

export function fileFlagStore(configDir = defaultConfigDir()): FlagStore {
  const defaults = loadBaseSettings(path.join(configDir, 'settings.json')).flags;
  const file = path.join(configDir, LOCAL_FLAGS_FILE);
  return { defaults, save(flags) {
    writeFileSync(`${file}.tmp`, JSON.stringify(flagOverrides(flags, defaults), null, 2) + '\n');
    renameSync(`${file}.tmp`, file);
  } };
}

export function memoryFlagStore(defaults: FlagSettings): FlagStore {
  return { defaults: { ...defaults }, save() {} };
}
