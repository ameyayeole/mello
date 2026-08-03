import { EventDetail } from '@/types/models';
import { isNewHost, isPartyActivity } from '@/services/safety';
import { CONFIG } from '@/constants/config';
import { COLORS } from '@/constants/colors';
import type { IconName } from '@/components/ui';

// A safety popup queued to show before a join goes through (spec #3/#5/#8/#10).
// Confirming one marks its flag seen and shows the next; the join fires only
// after the whole queue is confirmed. Dismissing cancels the join.
export interface QueuedSafetyPopup {
  flag: string;
  title: string;
  body: string | string[];
  primaryLabel: string;
  icon?: IconName;
  accent?: string;
  tint?: string;
  secondaryLabel?: string;
}

// What the primary action should offer. `none` = there is nothing to join
// (you are the host, or already in).
export type JoinGate =
  | 'join'
  | 'request'
  | 'pending'
  | 'full'
  | 'womenOnly'
  | 'premiumDistance'
  | 'none';

export function joinGate({
  event,
  isHost,
  isParticipant,
  isPending,
  premium,
  distanceM,
  viewerGender,
}: {
  event: EventDetail;
  isHost: boolean;
  isParticipant: boolean;
  isPending: boolean;
  premium: boolean;
  distanceM: number | null;
  viewerGender: string | undefined;
}): JoinGate {
  // Pending is checked before everything except membership: a request must
  // stay cancellable even when the event is full or out of range. The gate is
  // on joining, not on getting out.
  if (isHost || isParticipant) return 'none';
  if (isPending) return 'pending';

  // RLS already hides women-only events from non-female viewers; this is
  // client-side belt-and-braces for anything fetched by direct id.
  if (event.women_only && viewerGender !== 'female') return 'womenOnly';

  if (
    event.max_people != null &&
    (event.participant_count ?? 0) >= event.max_people
  ) {
    return 'full';
  }

  // Beyond the free radius, browsing is fine and joining needs Mello+.
  if (!premium && distanceM != null && distanceM > CONFIG.freeJoinRadiusMeters) {
    return 'premiumDistance';
  }

  return event.requires_approval ? 'request' : 'join';
}

// Which safety popups this event could raise, in the order they are shown.
// Whether each has actually been seen is a per-user lookup the caller does —
// this stays pure so the ordering and the scoping can be tested.
export function safetyFlagsFor(event: EventDetail): string[] {
  const flags = ['first_join'];
  if (event.women_only) flags.push(`women_event.${event.id}`);
  if (isNewHost(event.host?.created_at)) flags.push(`new_host.${event.host_id}`);
  if (isPartyActivity(event.activity)) flags.push(`party.${event.id}`);
  return flags;
}

// The copy for one flag. Returns null for a flag this event does not raise.
//
// Copy and flag names are lifted verbatim from EventBottomSheet — the flags
// are persisted per user, so a rename silently re-shows a popup someone
// already dismissed.
export function safetyPopup(
  flag: string,
  event: EventDetail
): QueuedSafetyPopup | null {
  if (flag === 'first_join') {
    return {
      flag,
      icon: 'parties',
      title: 'Nice — your first Mello 🎉',
      body: [
        'Meet in public the first time.',
        "Tell a friend where you're going.",
        "Check the host's profile and reviews.",
        'If anything feels off, leave and report — no explanation needed.',
      ],
      primaryLabel: 'Count me in',
    };
  }
  if (flag === `women_event.${event.id}`) {
    return {
      flag,
      icon: 'heart',
      accent: COLORS.safetyWomen,
      tint: COLORS.safetyWomenTint,
      title: 'A space for women',
      body:
        'This event is for women only. If anyone makes you ' +
        'uncomfortable you can leave, block and report — ' +
        "women's-safety reports are reviewed as a priority.",
      primaryLabel: 'Join',
    };
  }
  if (flag === `new_host.${event.host_id}`) {
    return {
      flag,
      icon: 'shieldAlert',
      accent: COLORS.safetyCaution,
      tint: COLORS.safetyCautionTint,
      title: 'A quick heads-up',
      body:
        "This host is fairly new to Mello. That's not necessarily a " +
        'problem — just take a little extra care: meet in public, bring ' +
        'a friend, and keep personal details to yourself.',
      primaryLabel: 'Got it, join anyway',
      secondaryLabel: 'View host profile',
    };
  }
  if (flag === `party.${event.id}`) {
    return {
      flag,
      icon: 'drinks',
      accent: COLORS.safetyParty,
      tint: COLORS.safetyPartyTint,
      title: 'Have a great night — stay in control',
      body: [
        'Know your limit and plan your way home.',
        "Watch your drink — don't accept opened drinks.",
        'Consent always matters. "No" is a full answer.',
        'Look out for each other.',
      ],
      primaryLabel: 'Got it',
    };
  }
  return null;
}
