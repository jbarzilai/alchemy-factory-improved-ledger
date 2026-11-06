// This repo must read correctly without the maintainer's private docs repo, so no file here may cite those docs, their
// milestones, or private claude.ai artifact pages.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { REPO } from './helpers/fixture';

// PLAN needs its .md: bare "plan" is ordinary prose.
const CITES_PRIVATE =
  /\bPLAN\.md\b|\b(?:CODEX-MEMORY|REVIEW-FLAGS|mod-research)\b|docs\/superpowers\b|\b[Mm]ilestone [0-9]|claude\.ai\/artifact/;
const SELF = 'packages/core/test/public-files.test.ts';

it('the pattern catches the private docs with or without .md', () => {
  const cites = ['see CODEX-MEMORY', 'the REVIEW-FLAGS list', 'the mod-research notes', '`docs/superpowers`', 'docs/PLAN.md'];
  expect(cites.filter(text => !CITES_PRIVATE.test(text))).toEqual([]);
});

it('the pattern catches plan milestones and private artifact links', () => {
  const cites = ['done in Milestone 3', '(milestone 2)', 'https://claude.ai/artifact/abc'];
  expect(cites.filter(text => !CITES_PRIVATE.test(text))).toEqual([]);
});

it('no public file cites the private docs', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean);
  const hits = files.filter(file => file !== SELF).filter(file => {
    const text = readFileSync(path.join(REPO, file)).toString('latin1');
    return !text.includes('\0') && CITES_PRIVATE.test(text);
  });
  expect(hits).toEqual([]);
});
