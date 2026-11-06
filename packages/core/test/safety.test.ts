// Core never calls file-writing APIs. If a cache writer is added later,
// give it its own module and list it in ALLOWED with a comment explaining it never touches the saves folder.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const ALLOWED = new Set<string>();
const WRITE_API = /\b(?:writeFile|appendFile|createWriteStream|write|writev|rename|unlink|rm|rmdir|copyFile|cp|truncate|ftruncate|mkdir|symlink|link|chmod|chown|utimes)(?:Sync)?\s*\(|\bopen(?:Sync)?\s*\([^,]*,\s*['"`][^'"`]*[wax+][^'"`]*['"`]|\bO_(?:WRONLY|RDWR|CREAT|TRUNC|APPEND)\b/;

it('recognizes file mutations and writable open flags', () => {
  const calls = [
    'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream',
    'write', 'writeSync', 'writev', 'writevSync', 'rename', 'renameSync', 'unlink', 'unlinkSync',
    'rm', 'rmSync', 'rmdir', 'rmdirSync', 'copyFile', 'copyFileSync', 'cp', 'cpSync',
    'truncate', 'truncateSync', 'ftruncate', 'ftruncateSync', 'mkdir', 'mkdirSync',
    'symlink', 'symlinkSync', 'link', 'linkSync', 'chmod', 'chmodSync', 'chown', 'chownSync', 'utimes', 'utimesSync',
  ];
  const offenders = calls.map((name) => `fs.${name}(p, data)`);
  for (const call of ['open', 'openSync', 'fs.promises.open']) {
    for (const flag of ['w', 'a', 'x', 'r+', 'wx', 'ax', 'as+']) {
      for (const quote of ["'", '"', '`']) offenders.push(`${call}(p, ${quote}${flag}${quote})`);
    }
  }
  for (const flag of ['O_WRONLY', 'O_RDWR', 'O_CREAT', 'O_TRUNC', 'O_APPEND']) {
    offenders.push(`fs.openSync(p, constants.${flag})`);
  }
  for (const line of offenders) expect(line, line).toMatch(WRITE_API);
});

it('allows read-only calls and unrelated names', () => {
  const benign = [
    'readFile(p)', "readFileSync(p, 'utf8')", "openSync(p, 'r')", 'child.stdin.end(src)',
    'confirm(x)', 'transform(x)', 'readdir(SRC, { recursive: true })',
  ];
  for (const line of benign) expect(line, line).not.toMatch(WRITE_API);
});

it('core source never calls file-writing APIs', async () => {
  const files = (await readdir(SRC, { recursive: true })).filter((f) => f.endsWith('.ts') && !ALLOWED.has(f));
  expect(files.length).toBeGreaterThan(0);
  const offenders: string[] = [];
  for (const f of files) {
    const lines = (await readFile(path.join(SRC, f), 'utf8')).split('\n');
    lines.forEach((line, i) => {
      if (WRITE_API.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  expect(offenders).toEqual([]);
});
