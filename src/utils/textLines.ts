// How many of a text block's measured lines fit in the vertical space above
// a fixed boundary (the event sheet's pinned CTA footer, in practice).
// Floors rather than rounds — a partially-visible line reads as a rendering
// bug, not as "there's more below."
export function clampVisibleLineCount(
  availableHeight: number,
  lineHeight: number,
  totalLines: number
): number {
  if (totalLines <= 0 || lineHeight <= 0 || availableHeight <= 0) return 0;
  const fits = Math.floor(availableHeight / lineHeight);
  return Math.max(1, Math.min(fits, totalLines));
}
