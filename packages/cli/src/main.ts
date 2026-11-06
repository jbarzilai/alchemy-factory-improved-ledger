import { run } from './run';
import { colorEnabled } from './format';
import { loadEnv } from './env';

const loaded = loadEnv(process.env);
if (loaded.envError) process.stderr.write(`af-ledger: ignoring env file: ${loaded.envError}\n`);
process.exitCode = await run(process.argv.slice(2), {
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
  ...loaded,
  color: colorEnabled(Boolean(process.stdout.isTTY), loaded.env),
});
