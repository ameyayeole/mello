// How long after an event the launch card will still deal itself.
//
// The same 48 hours as the force-unlock clock, and for the same reason: this is
// the window in which the wrap is a live thing rather than a memory. It is NOT
// the contribution window — contributing stays open seven days
// (`wrap_window_open`, migration 032).
export const DEAL_WINDOW_HOURS = 48;

// Whether to deal the wrap card on this app open.
//
// Deliberately narrow. This is the app's one uninvited full-screen moment, so
// every clause here is a reason NOT to show it: already seen, already done,
// too early, too late.
export function shouldDealWrap(args: {
  hoursSinceEnd: number;
  alreadyDealt: boolean;
  hasContributed: boolean;
}): boolean {
  if (args.alreadyDealt) return false;
  // Nothing to invite them to — they have already wrapped this one.
  if (args.hasContributed) return false;
  if (args.hoursSinceEnd < 0) return false;
  return args.hoursSinceEnd < DEAL_WINDOW_HOURS;
}
