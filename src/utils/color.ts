// Colour maths for the tinted surfaces in the design language — a chip or tag
// that reads as *the accent, seen through glass* rather than a flat swatch.
//
// Every accent in the app (`COLORS.primary`, `COLORS.secondary`, and each
// `categoryStyle` accent) is a 6-digit hex, so adding alpha is a string suffix
// rather than a parse. Anything else returns null, which callers fall back
// from — the safe direction to fail in, since a chip that is too loud still
// reads, while one built from an invalid colour renders black.
export function alpha(hex: string, a: number): string | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const clamped = Math.min(Math.max(a, 0), 1);
  return (
    hex +
    Math.round(clamped * 255)
      .toString(16)
      .padStart(2, '0')
  );
}
