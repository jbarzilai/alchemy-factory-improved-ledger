import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { repoRoot } from './config';

// Undefined when disabled (AF_ENV_FILE=none) or when there is no repository to hold a default .env.
export function envFilePath(env: NodeJS.ProcessEnv): string | undefined {
  if (env.AF_ENV_FILE === 'none') return undefined;
  if (env.AF_ENV_FILE) return env.AF_ENV_FILE;
  try { return path.join(repoRoot(), '.env'); } catch { return undefined; }
}

// An unreadable env file is reported (envError), not thrown, so doctor and bootstrap can still run.
export function loadEnv(source: NodeJS.ProcessEnv): { env: NodeJS.ProcessEnv; envFile?: string; envError?: string } {
  const file = envFilePath(source);
  let values: NodeJS.ProcessEnv = {};
  let envFile: string | undefined;
  let envError: string | undefined;
  if (file) {
    try {
      values = parseEnv(readFileSync(file, 'utf8'));
      envFile = file;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') envError = `${file}: ${(error as Error).message}`;
    }
  }
  const env: NodeJS.ProcessEnv = {};
  for (const key of new Set([...Object.keys(values), ...Object.keys(source)])) {
    const value = source[key] || values[key];
    if (value) env[key] = value;
  }
  return envError ? { env, envFile, envError } : { env, envFile };
}
