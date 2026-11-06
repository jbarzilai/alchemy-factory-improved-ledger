// This repo must read correctly without the maintainer's private docs repo, so no file here may cite those docs.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { REPO } from './helpers/fixture';

const CITES_PRIVATE = /\b(?:PLAN|CODEX-MEMORY|REVIEW-FLAGS|mod-research)\.md\b|docs\/superpowers\//;
const SELF = 'packages/core/test/public-files.test.ts';

it('no public file cites the private docs', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean);
  const hits = files.filter(file => file !== SELF).filter(file => {
    const text = readFileSync(path.join(REPO, file)).toString('latin1');
    return !text.includes('\0') && CITES_PRIVATE.test(text);
  });
  expect(hits).toEqual([]);
});
