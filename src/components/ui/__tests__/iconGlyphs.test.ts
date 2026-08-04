import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Guards a failure mode that nothing else in the toolchain can see.
//
// Icon maps app names onto Solar components. Some Solar glyphs draw with SVG
// primitives that this project's react-native-svg build does not provide —
// <Ellipse> is the known one — and the result is a *render-time* crash
// ("Property 'Ellipse' doesn't exist"), not a type error and not a lint
// warning. So the icon type-checks, lints, ships, and then throws a red box the
// first time someone opens the screen it is on.
//
// It has now bitten twice: once on the community tab glyph
// (UsersGroupRounded), and once on Ghost, which reached a commit. A comment
// warning about it was already in Icon.tsx both times, which is the argument
// for a test rather than a third comment.
//
// Reads the icon map as text on purpose. Importing Icon.tsx would pull in
// Reanimated and react-native-svg, which is exactly what this suite can't do.

const ICON_SRC = join(__dirname, '..', 'Icon.tsx');
const SOLAR_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'node_modules',
  'react-native-solar-icons',
  'dist',
  'generated'
);

// Primitives Icon.tsx imports from react-native-svg, and therefore the only
// ones known to exist in this build.
const SUPPORTED = ['Svg', 'Path', 'Circle', 'Rect', 'Defs', 'Stop', 'G'];
const UNSUPPORTED = [
  'Ellipse',
  'Polygon',
  'Polyline',
  'Line',
  'Mask',
  'ClipPath',
  'Use',
  'TSpan',
];

function solarNames(): { appName: string; solarName: string }[] {
  const src = readFileSync(ICON_SRC, 'utf8');
  // Both the SOLAR map and TAB_SOLAR use the same `name: 'Component',` shape.
  return [...src.matchAll(/^ {2}(\w+): '([A-Z]\w+)',$/gm)].map((m) => ({
    appName: m[1],
    solarName: m[2],
  }));
}

describe('Solar icon map', () => {
  const mapped = solarNames();

  it('reads a non-empty map (guards the regex itself)', () => {
    expect(mapped.length).toBeGreaterThan(30);
  });

  describe.each(mapped)('$appName → $solarName', ({ solarName }) => {
    // Icon falls back to the linear pack when a name is missing from bold, so
    // linear must exist; bold only has to be safe if it is there.
    it('has a linear variant', () => {
      expect(existsSync(join(SOLAR_DIR, 'linear', `${solarName}.esm.js`))).toBe(
        true
      );
    });

    it.each(['linear', 'bold'])(
      'uses only renderable primitives (%s)',
      (variant) => {
        const file = join(SOLAR_DIR, variant, `${solarName}.esm.js`);
        if (!existsSync(file)) return; // bold is optional; linear is asserted above
        const code = readFileSync(file, 'utf8');
        const offenders = UNSUPPORTED.filter((p) =>
          new RegExp(`\\b${p}\\b`).test(code)
        );
        expect(offenders).toEqual([]);
      }
    );
  });
});

describe('supported primitive list', () => {
  it('matches what Icon.tsx actually imports from react-native-svg', () => {
    const src = readFileSync(ICON_SRC, 'utf8');
    const imported = src.match(
      /import Svg,\s*\{([^}]*)\}\s*from 'react-native-svg'/
    );
    expect(imported).not.toBeNull();
    const names = imported![1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // Anything Icon imports must be in SUPPORTED, or the list above is stale
    // and the test is checking the wrong thing.
    for (const n of names) expect(SUPPORTED).toContain(n);
  });
});
