// Decides whether a newly-resolved city (from reverse geocoding) should be
// persisted to profiles.city. Pure so it's testable without React/Expo —
// see AGENTS.md: anything living only inside a hook is untestable here
// (Reanimated 4 throws on import under Jest, so there are no component tests).
export function nextProfileCity(
  resolved: string | null | undefined,
  current: string | null | undefined
): string | null {
  const trimmedResolved = resolved?.trim();
  if (!trimmedResolved) return null;

  // 'Nearby' is useLocation's display fallback when geocoding fails to
  // produce a city/district/region — never write it. The feed's same-city
  // rung matches on string equality, so writing this fake city would make
  // every user with flaky geocoding "local" to every other such user.
  if (trimmedResolved.toLowerCase() === 'nearby') return null;

  const trimmedCurrent = current?.trim();
  if (trimmedCurrent && trimmedCurrent.toLowerCase() === trimmedResolved.toLowerCase()) {
    return null;
  }

  return trimmedResolved;
}
