import { SuperlativeWinner, WrapStatus, WrapSummary } from '@/types/models';

// What the "That's a wrap" page shows, split into the half everyone sees and
// the half only the viewer does.
//
// A pure function rather than conditionals in JSX because the split is the one
// thing here that fails invisibly: a leak renders as a perfectly good-looking
// page. The boundary is not taste — it is what the RLS already permits
// (spec §7.4). Thumbs are readable only by the rater, notes only by sender and
// recipient, event feedback only by its author.
export interface RecapSections {
  shared: {
    photoCount: number;
    attendeeCount: number;
    reactionCount: number;
    messageCount: number;
    superlatives: SuperlativeWinner[];
    encoreCount: number;
  };
  yours: {
    thumbsReceived: number;
  };
}

export function recapSections(
  summary: WrapSummary,
  status: WrapStatus | undefined
): RecapSections {
  return {
    shared: {
      photoCount: summary.photoCount,
      attendeeCount: summary.attendeeCount,
      // `likeCount` counts reactions since migration 077 — the column kept its
      // name so `top_photos` ordering did not have to change.
      reactionCount: summary.likeCount,
      messageCount: summary.messageCount,
      // A winner only exists at 3+ votes (033:140); below that the RPC returns
      // the category with a null winner, which must not render as a blank card.
      superlatives: summary.superlatives.filter((s) => !!s.winner_id),
      encoreCount: status?.encoreCount ?? 0,
    },
    yours: {
      thumbsReceived: summary.myThumbsReceived,
    },
  };
}
