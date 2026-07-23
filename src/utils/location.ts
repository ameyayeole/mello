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

// The words that mark a component as a *street* rather than an area — the line
// we want to skip past. Matched as a whole token, case-insensitively.
const STREET_WORDS = new Set([
  'st', 'street', 'rd', 'road', 'ave', 'avenue', 'ln', 'lane', 'blvd',
  'boulevard', 'dr', 'drive', 'hwy', 'highway', 'way', 'ct', 'court', 'pl',
  'place', 'sq', 'square', 'cross', 'main', 'marg',
]);

// A part is "street-ish" if it opens with a house/plot number ("801 Jessie St",
// "1st Main") or contains a street word ("Jessie St"). Areas like "Kalyan
// Nagar" or "Indiranagar" match neither.
function isStreetish(part: string): boolean {
  if (/^\d/.test(part)) return true;
  return part
    .toLowerCase()
    .split(/\s+/)
    .some((tok) => STREET_WORDS.has(tok.replace(/[.,]/g, '')));
}

// The neighbourhood/area line of a full address — what you'd actually say when
// asked where something is. Google gives us "801 Jessie St, Kalyan Nagar,
// Bengaluru, …"; we want "Kalyan Nagar", not the street and not the city.
//
// Skip the leading street lines (and the pure-number/duplicate noise
// shortLocation already drops) and return the first area component. Falls back
// to shortLocation when every part looks like a street, so a bare "801 Jessie
// St" still shows *something* rather than blank.
export function neighbourhood(name: string): string {
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

  const area = parts.find((p) => !isStreetish(p));
  return area ?? shortLocation(name);
}
