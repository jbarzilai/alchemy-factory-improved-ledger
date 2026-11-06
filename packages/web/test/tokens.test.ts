import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
// @ts-expect-error JS generator is intentionally usable without a TS build.
import { renderTokensCss } from '../../../design/tokens-css.mjs';
import tokens from '../../../design/tokens.json';
test('committed CSS is generated exactly, preserving every theme token and value', async () => {
  const css = renderTokensCss(tokens) as string;
  expect(css).toBe(await readFile(new URL('../../../design/tokens.css', import.meta.url), 'utf8'));
  for (const theme of tokens.color.themes) {
    const body = css.split(`[data-theme="${theme.id}"]`)[1]!.split('}')[0]!;
    for (const token of [...tokens.color.tokens, ...tokens.shadow.tokens]) {
      expect(body).toContain(`--${token.name}: ${token.value[theme.id as 'dark' | 'light']};`);
    }
  }
  for (const token of [...tokens.spacing.tokens, ...tokens.radius.tokens]) expect(css).toContain(`--${token.name}: ${token.value};`);
  for (const group of tokens.type.groups) for (const style of group.styles) expect(css).toContain(`.${style.name} {`);
});
