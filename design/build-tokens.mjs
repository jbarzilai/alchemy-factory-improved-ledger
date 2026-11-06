import { readFile, writeFile } from 'node:fs/promises';
import { renderTokensCss } from './tokens-css.mjs';
const tokens = JSON.parse(await readFile(new URL('./tokens.json', import.meta.url), 'utf8'));
await writeFile(new URL('./tokens.css', import.meta.url), renderTokensCss(tokens));
