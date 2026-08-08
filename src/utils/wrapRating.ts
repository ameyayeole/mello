// Why someone was thumbed down — offered after the rating has already saved,
// and never required.
//
// Two kinds of statement share one chip row, and they must NOT share a
// destination. "Made me uncomfortable" is a safety signal and files a real
// report; "not my vibe" is taste and is recorded nowhere. Collecting the first
// and routing it nowhere is worse than never asking.
export type DownReason = 'uncomfortable' | 'no_show' | 'not_my_vibe';

export const DOWN_REASONS: { id: DownReason; label: string }[] = [
  { id: 'uncomfortable', label: 'Made me uncomfortable' },
  { id: 'no_show', label: 'No-show' },
  { id: 'not_my_vibe', label: 'Not my vibe' },
];

// Safety reasons write a `reports` row (migration 014). Preferences do not.
export function isSafetyReason(reason: DownReason): boolean {
  return reason === 'uncomfortable' || reason === 'no_show';
}
