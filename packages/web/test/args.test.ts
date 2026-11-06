import { expect, it } from 'vitest';
import { parseWebArgs } from '../server/args';
it('parses dev, prod and save selection', () => {
  expect(parseWebArgs([])).toEqual({ mode: 'dev' });
  expect(parseWebArgs(['--prod'])).toEqual({ mode: 'prod' });
  expect(parseWebArgs(['--save', 'P'])).toEqual({ mode: 'dev', save: 'P' });
  expect(parseWebArgs(['--save', 'P', '--prod'])).toEqual({ mode: 'prod', save: 'P' });
});
it.each(['--port', '--host'])('rejects %s with the settings hint', (arg) => {
  expect(() => parseWebArgs([arg, '5000'])).toThrow(`unknown option ${arg}; the port is set in config/settings.json`);
});
it('rejects unknown options and missing save paths', () => {
  expect(() => parseWebArgs(['--nope'])).toThrow('unknown option --nope');
  expect(() => parseWebArgs(['P'])).toThrow('unknown option P');
  for (const args of [['--save'], ['--save', '--prod'], ['--save', '']]) {
    expect(() => parseWebArgs(args)).toThrow('--save needs a file or folder');
  }
});
