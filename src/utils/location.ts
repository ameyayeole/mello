// Google addresses arrive as "226, Halav Pool, Halav Pool, Mumbai, …" — keep
// just the first meaningful, non-repeated place name.
export function shortLocation(name: string): string {
  const seen = new Set<string>();
  const parts = name
    .split(',')
    .map((s) => s.trim())
    .filter((p) => {
      const key = p.toLowerCase();
      if (!p || seen.has(key) || /^\d+[-/]?\d*$/.test(p)) return false;
      seen.add(key);
      return true;
    });
  return parts[0] ?? name;
}
