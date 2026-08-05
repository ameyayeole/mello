import {
  COLORS,
  DARK,
  LIGHT,
  applyPalette,
  activePaletteName,
} from '@/constants/colors';
import { themedStyles } from '@/theme';

afterEach(() => applyPalette('light'));

describe('the two palettes', () => {
  // The type already enforces this. The test is for the case the type cannot
  // see: a value added with a cast, or a key deleted from one side in a merge.
  // A palette missing a key does not throw — `COLORS.x` is `undefined`, which
  // React Native treats as "no colour", so text goes invisible on one theme and
  // nowhere else.
  it('have exactly the same keys', () => {
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort());
  });

  it('have no empty values', () => {
    for (const [name, palette] of [
      ['light', LIGHT],
      ['dark', DARK],
    ] as const) {
      for (const [key, value] of Object.entries(palette)) {
        expect(`${name}.${key}=${value}`).toBe(
          `${name}.${key}=${String(value).trim()}`
        );
        expect(value).not.toBe('');
      }
    }
  });

  // Not a style rule — a legibility one. These four carry body text and the
  // surfaces under it, and getting one of them backwards is the difference
  // between a dark theme and an unreadable one.
  it('actually inverts', () => {
    expect(LIGHT.textPrimary).not.toBe(DARK.textPrimary);
    expect(LIGHT.background).not.toBe(DARK.background);
    expect(LIGHT.surface).not.toBe(DARK.surface);
    expect(LIGHT.accent).not.toBe(DARK.accent);
  });
});

describe('COLORS', () => {
  it('reads the active palette rather than a copy taken at import', () => {
    expect(COLORS.background).toBe(LIGHT.background);
    applyPalette('dark');
    expect(COLORS.background).toBe(DARK.background);
    expect(activePaletteName()).toBe('dark');
  });

  // `{...COLORS}` and `Object.keys(COLORS)` have to keep working — the proxy
  // needs its `ownKeys`/`getOwnPropertyDescriptor` traps for that, and without
  // them a spread silently yields `{}`.
  it('can be enumerated and spread', () => {
    applyPalette('dark');
    const snapshot = { ...COLORS };
    expect(Object.keys(snapshot).length).toBe(Object.keys(DARK).length);
    expect(snapshot.textPrimary).toBe(DARK.textPrimary);
  });
});

describe('themedStyles', () => {
  it('resolves against the palette active when it is read, not when declared', () => {
    // Declared while light — which is the situation of all 149 real call sites:
    // they run at import, long before the stored theme is known.
    const styles = themedStyles(() => ({
      row: { backgroundColor: COLORS.background },
    }));

    expect(styles.row.backgroundColor).toBe(LIGHT.background);
    applyPalette('dark');
    expect(styles.row.backgroundColor).toBe(DARK.background);
  });

  it('hands back the same object within one palette', () => {
    const styles = themedStyles(() => ({ row: { flex: 1 } }));
    // Style identity is a prop: a new object every read would re-render every
    // consumer on every render.
    expect(styles.row).toBe(styles.row);
  });

  it('only re-runs the factory when the palette changes', () => {
    const factory = jest.fn(() => ({ row: { flex: 1 } }));
    const styles = themedStyles(factory);

    void styles.row;
    void styles.row;
    expect(factory).toHaveBeenCalledTimes(1);

    applyPalette('dark');
    void styles.row;
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
