import { hasWrapped, wrapEndAt } from '@/services/wrap.service';

// Structural rather than `NearbyEvent`: these only ever look at the two time
// fields, and typing them this way means they can be driven from plain objects
// in a test without building a whole event fixture.
type Timed = { starts_at: string; ends_at: string | null };

/**
 * Past vs future, keyed on when an event *ends* rather than when it starts.
 *
 * `wrapEndAt` is the app's one answer to "is this over" and treats a missing
 * `ends_at` as four hours after the start. Comparing `starts_at` to the clock
 * instead — which both screens did — files an event you are standing at under
 * "Attended" the moment it kicks off.
 *
 * Needed because no endpoint returns this split: `getJoinedEvents` hands back
 * every approved participation and `getMyEvents` filters only on `is_active`,
 * so the date cut has to happen client-side.
 */
export function splitByWhen<T extends Timed>(
  rows: T[]
): { upcoming: T[]; attended: T[] } {
  return {
    upcoming: rows
      .filter((e) => !hasWrapped(e))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    // Most recent first: the last thing you went to is the one you're looking
    // for.
    attended: rows
      .filter((e) => hasWrapped(e))
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
  };
}

/**
 * The hosted event that earns the hero slot: the soonest one still to come,
 * or — if there is nothing coming up — the one that finished most recently.
 *
 * The fallback is the point. Hosting is bursty, so most of the time you have no
 * upcoming event, and a card that simply vanished would take the route to the
 * wrap with it right when the wrap is the only thing you'd want. A finished
 * event still has a guest list, a chat and photos to collect.
 *
 * Callers must render it differently when it has ended — `hasWrapped` — since
 * "You're hosting" over last week's picnic is a lie.
 */
export function featuredHostedEvent<T extends Timed>(rows: T[]): T | null {
  const next = rows.find((e) => !hasWrapped(e));
  if (next) return next;

  // Latest-ending, not last in the array: callers sort by `starts_at`, and a
  // long event that began earlier can still finish after a short later one.
  return rows.reduce<T | null>(
    (latest, e) =>
      !latest || wrapEndAt(e).getTime() > wrapEndAt(latest).getTime() ? e : latest,
    null
  );
}
