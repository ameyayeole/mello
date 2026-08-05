import { readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * Guards the failure mode that made every card in the app light on the dark
 * theme, hours after the theme "worked".
 *
 * A module-level constant that reads `COLORS` is evaluated **once, at import** —
 * before the app knows which theme it is in, and permanently. `themedStyles`
 * solves this for stylesheets, which is 149 of the cases. It does not solve it
 * for the plain objects nobody thinks of as styles:
 *
 *   const FILL: Record<GlassTier, string> = { panel: COLORS.glassPanel };
 *
 * That one was `Glass`'s fill map, so every glass surface in the app — cards,
 * the tab bar, headers — stayed light. Nothing catches it: `tsc` sees a valid
 * string, the app renders, and the colour is simply from the other theme.
 *
 * The fix in each case is to defer the read: a function, an arrow, or a getter.
 * This test looks for the ones that do not.
 *
 * It is a text scan, and it says so. It finds the common shape — a top-level
 * `const` whose statement mentions `COLORS.` with nothing lazy in it — and will
 * miss an eager read hidden inside an object that also happens to contain a
 * getter. That is a net, not a proof.
 */

const ROOT = join(__dirname, '..', '..');

// Anything that means "this is evaluated later, not now".
const DEFERRED = ['themedStyles', '=>', 'function', 'get '];

function sourceFiles(): string[] {
  const out = execSync(
    `find app src -name '*.ts' -o -name '*.tsx'`,
    { cwd: ROOT, encoding: 'utf8' }
  );
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.includes('__tests__'))
    // The palettes themselves, obviously, and the helper that defers them.
    .filter((f) => !f.endsWith('constants/colors.ts') && !f.endsWith('src/theme.ts'));
}

// Top-level statements, by tracking bracket depth from column 0.
function topLevelStatements(src: string): string[] {
  const out: string[] = [];
  let buf: string[] = [];
  let depth = 0;
  for (const line of src.split('\n')) {
    buf.push(line);
    let code = line.split('//')[0];
    for (const q of ['"', "'", '`']) {
      const parts = code.split(q);
      if (parts.length > 1) code = parts[0];
    }
    for (const c of code) {
      if ('{(['.includes(c)) depth++;
      else if ('})]'.includes(c)) depth--;
    }
    if (depth <= 0) {
      out.push(buf.join('\n'));
      buf = [];
      depth = 0;
    }
  }
  if (buf.length) out.push(buf.join('\n'));
  return out;
}

describe('no module-level palette captures', () => {
  const offenders: string[] = [];

  for (const file of sourceFiles()) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    if (!src.includes('COLORS.')) continue;
    for (const statement of topLevelStatements(src)) {
      const head = statement.trimStart();
      if (!head.startsWith('const ') && !head.startsWith('export const ')) continue;
      if (!statement.includes('COLORS.')) continue;
      if (DEFERRED.some((marker) => statement.includes(marker))) continue;
      const name = head.split('=')[0].replace(/^export /, '').replace('const', '').trim();
      offenders.push(`${file} → ${name.split(':')[0].trim()}`);
    }
  }

  it('finds none', () => {
    // Wrap it in a function, an arrow or a getter — see the header. Every one of
    // these is a value that will be from the wrong theme.
    expect(offenders).toEqual([]);
  });

  it('scanned a meaningful number of files (guards the scanner itself)', () => {
    expect(sourceFiles().length).toBeGreaterThan(100);
  });
});
