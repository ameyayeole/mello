// PostgREST parses the argument to `.or()` as filter *grammar*, not as data:
// commas separate conditions, dots separate column.operator.value, and
// parentheses group. Interpolating a raw search box into that string means a
// user typing "coffee, bandra" produces an unparseable logic tree and the
// request fails with PGRST100 / HTTP 400 before it ever reaches the database.
//
// Wrapping the value in double quotes makes it a single literal. Inside quotes
// only `"` and `\` are special, and both escape with a backslash.
//
// Note this deliberately does NOT escape the LIKE wildcards `%` and `_`. A user
// typing "50%" still gets wildcard behaviour, which is a reasonable thing for a
// search box to do and is not a correctness problem — unlike the crash above.
export function ilikePattern(term: string): string {
  const escaped = term.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"%${escaped}%"`;
}

// Same literal-safety as ilikePattern, but anchored at the start: `"term%"`. Use
// for typeahead where a substring match ("a" hitting every name with an 'a') is
// too noisy and only a starts-with match is wanted (e.g. @mention search).
export function prefixIlikePattern(term: string): string {
  const escaped = term.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}%"`;
}
