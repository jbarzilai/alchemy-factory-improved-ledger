import { readlinkSync, realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot, saveRoots } from '@af-ledger/core';

export const PNG_LAYOUT = { font: 16, line: 22, char: 0.602, pad: 28, scale: 2 } as const;

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function ansiToSvg(text: string): { svg: string; width: number; height: number } {
  const { font, line, char, pad } = PNG_LAYOUT;
  let bold = false;
  let fill = '#d4d4d4';
  let maxColumns = 0;
  const lines = text.replace(/\n+$/, '').split('\n');
  const rendered = lines.map((s, i) => {
    let columns = 0;
    let runs = '';
    let start = 0;
    const append = (value: string) => {
      if (!value) return;
      // Control characters are invalid in XML 1.0 and would make librsvg reject the whole SVG.
      value = value.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
      if (!value) return;
      columns += [...value].length;
      runs += `<tspan fill="${fill}"${bold ? ' font-weight="bold"' : ''}>${escapeXml(value)}</tspan>`;
    };
    for (const match of s.matchAll(/\x1b\[([\d;]*)m/g)) {
      append(s.slice(start, match.index));
      for (const code of match[1].split(';').map(Number)) {
        if (code === 0) { bold = false; fill = '#d4d4d4'; }
        else if (code === 1) bold = true;
        else if (code === 31) fill = '#f14c4c';
        else if (code === 32) fill = '#23d18b';
      }
      start = match.index + match[0].length;
    }
    append(s.slice(start));
    maxColumns = Math.max(maxColumns, columns);
    return `<text x="${pad}" y="${pad + font + i * line}" xml:space="preserve">${runs}</text>`;
  });
  const width = Math.ceil(maxColumns * char * font + 2 * pad);
  const height = lines.length * line + 2 * pad;
  return { width, height, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#1e1e1e"/><g font-family="DejaVu Sans Mono, Consolas, monospace" font-size="${font}" fill="#d4d4d4">${rendered.join('')}</g></svg>` };
}

export async function writePng(text: string, file: string): Promise<void> {
  const { svg } = ansiToSvg(text);
  const { default: sharp } = await import('sharp');
  await mkdir(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svg), { density: 72 * PNG_LAYOUT.scale }).png().toFile(file);
}

export function exportsDir(env: NodeJS.ProcessEnv): string {
  return env.AF_EXPORT_DIR || path.join(repoRoot(), 'exports');
}

export function exportSlug(saveName: string): string {
  return saveName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'save';
}

// Resolve existing ancestors too: the output file or its parents may be symlinks.
function canonical(file: string, depth = 0): string {
  if (depth > 40) throw new Error('too many symbolic links in output path');
  const absolute = path.resolve(file);
  try { return realpathSync(absolute); }
  catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    try {
      const link = readlinkSync(absolute);
      return canonical(path.resolve(path.dirname(absolute), link), depth + 1);
    } catch (linkError) {
      if (!['ENOENT', 'ENOTDIR', 'EINVAL'].includes((linkError as NodeJS.ErrnoException).code ?? '')) throw linkError;
    }
    const parent = path.dirname(absolute);
    if (parent === absolute) return absolute;
    return path.join(canonical(parent, depth), path.basename(absolute));
  }
}

export type OutputGuard = { label?: string; gameDirs?: string[] };

// `gameDirs` are game installs that must not receive the output either, checked as written and canonically.
export function outputBlocked(
  file: string, saveFile: string, env: NodeJS.ProcessEnv, { label = 'PNG output', gameDirs = [] }: OutputGuard = {},
): string | null {
  const target = canonical(file);
  const gamePath = (p: string) => /(?:^|[\\/])alchemyfactory[\\/]saved(?:[\\/]|$)/i.test(p);
  // Compare case-insensitively: /mnt/c (and Windows) paths ignore case, so /mnt/c/users/... is /mnt/c/Users/....
  const relative = (root: string) => path.relative(canonical(root).toLowerCase(), target.toLowerCase());
  const within = (r: string) => r === '' || (!path.isAbsolute(r) && r !== '..' && !r.startsWith(`..${path.sep}`));
  const inside = (root: string) => within(relative(root));
  const insideAsWritten = (root: string) => within(path.relative(path.resolve(root).toLowerCase(), path.resolve(file).toLowerCase()));
  const guarded = gameDirs.filter(Boolean);
  if (guarded.some((root) => inside(root) || insideAsWritten(root))) return `${label} must not be inside the game directory`;
  // The selected save's own folder is protected, but not its subfolders: a save copied to a broad folder (e.g. home)
  // must not block every output path. Save roots are protected recursively.
  const besideSave = Boolean(saveFile) && !relative(path.dirname(saveFile)).includes(path.sep) && inside(path.dirname(saveFile));
  if (/\.sav$/i.test(file) || /\.sav$/i.test(target) || gamePath(file) || gamePath(target) ||
      besideSave || saveRoots(env).some(inside)) {
    return `${label} must not write a .sav file or inside a saves folder`;
  }
  return null;
}
