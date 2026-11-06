import { defaultConfigDir, defaultKdecPath } from '@af-ledger/core';

export function kdecPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.AF_KDEC || defaultKdecPath();
}

export function configDir(): string {
  return defaultConfigDir();
}
