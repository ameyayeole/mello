import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import { useUIStore } from '@/stores/uiStore';
import { useEventCard } from '@/hooks/useEventCard';
import { shareEvent } from '@/utils/shareEvent';
import { SafetyPopup } from '@/components/safety';
import { Button, DealtCard, Dialog, STACK_DEPTH } from '@/components/ui';
import { EventCard } from './EventCard';
import { EventCardBack } from './EventCardBack';
import type { EventParticipant, NearbyEvent } from '@/types/models';

// The feeds a deck's ids could have come from — the map's nearby query, the
// explore/dashboard/swipe feeds, the wishlist. A background card (everything
// but the top of the stack) looks itself up in whichever of these already has
// it instead of firing its own detail query — see the brief's "only the
// visible top card should fetch": the stack must cost no extra requests.
// These are prefixes (`.all`/the bare nearby key), not full keys — TanStack
// matches a query's key by prefix, same as `invalidateQueries` does.
const FEED_CACHE_PREFIXES: readonly QueryKey[] = [
  queryKeys.events.nearby,
  queryKeys.exploreFeed.all,
  queryKeys.dashboardNearby.all,
  queryKeys.swipeDeck.all,
  queryKeys.savedEvents.all,
];

// Some of these are plain-array queries, some are `useInfiniteQuery` pages —
// flattened the same way regardless of which.
function flattenCacheEntry(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (
    data &&
    typeof data === 'object' &&
    'pages' in data &&
    Array.isArray((data as { pages?: unknown }).pages)
  ) {
    return (data as { pages: unknown[][] }).pages.flat();
  }
  return [];
}

// A read of whatever's already in cache for one event id — never a fetch.
// Not a live subscription: a background dealt card is a snapshot, not
// something that needs to stay in sync with a feed refetching behind it.
function useCachedEventSummary(
  id: string
): (NearbyEvent & { participants?: EventParticipant[] }) | undefined {
  const qc = useQueryClient();
  return useMemo(() => {
    for (const prefix of FEED_CACHE_PREFIXES) {
      const entries = qc.getQueriesData<unknown>({ queryKey: prefix });
      for (const [, data] of entries) {
        const match = flattenCacheEntry(data).find(
          (row): row is NearbyEvent =>
            !!row &&
            typeof row === 'object' &&
            (row as { id?: unknown }).id === id
        );
        if (match) return match;
      }
    }
    return undefined;
    // qc is stable for the app's lifetime; re-runs only when the id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
}

// A background card — everything but the top of the stack. `DealtCard` gives
// every layer but the top `pointerEvents="none"` and never mounts its `back`,
// so this only needs a front face, and a plain one at that (blurred=false —
// see EventCard's own comment on why five real BlurViews is a real iOS cost).
function BackgroundFace({ id }: { id: string }) {
  const summary = useCachedEventSummary(id);
  if (!summary) return <View style={styles.placeholder} />;
  return <EventCard event={summary} blurred={false} />;
}

// The dealt card for one event, driven entirely by `uiStore.dealtCard` — no
// props, so one instance mounted in the tabs layout serves every opener (the
// map, the home rail, a friend's profile, the wishlist, the swipe deck): each
// just calls `dealCard(ids, index, origin)` and this renders whatever that
// produced.
//
// Replaces `GlobalEventSheet` as the app's one event surface. The old sheet
// still exists side by side until Task 9 deletes it.
export function EventDealtCard() {
  const router = useRouter();
  const deal = useUIStore((s) => s.dealtCard);
  const advance = useUIStore((s) => s.advanceDealtCard);
  const close = useUIStore((s) => s.closeDealtCard);
  const dealCard = useUIStore((s) => s.dealCard);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const topId = deal?.ids[deal.index] ?? null;
  const {
    event,
    gate,
    primaryLabel,
    onPrimary,
    queue,
    confirmQueued,
    dismissQueue,
    saved,
    toggleSave,
    leave,
  } = useEventCard(topId);

  // The new-host safety popup's secondary action ("View host profile") was
  // deliberately left out of `QueuedSafetyPopup` — it has no callback slot by
  // design, since it's the only one of the four flags with a navigation side
  // effect (see eventCardGates.ts and the Task 3 carry-forward note in
  // progress.md). `safetyPopup()` only sets `secondaryLabel` for that flag, so
  // its presence — not the flag string — is what gates wiring this in.
  const current = queue[0];
  const handleViewHostProfile = useCallback(() => {
    if (!event) return;
    dismissQueue();
    close();
    router.push(`/friends/${event.host_id}`);
  }, [event, dismissQueue, close, router]);

  // The card's own swipe gesture, supplied to `DealtCard`. This is generic
  // advance-and-save/advance-only — NOT `useSwipeDeck`'s `swipe()`, which
  // records a permanent pass and spends one of ten daily free swipes. That
  // hook is never imported here; wiring it in would mean browsing the map
  // silently burned a user's quota. (The swipe screen's own opener is Task
  // 8's job — it passes its real `swipe()` through there, not here.)
  // Right always SAVES (never toggles): a card already bookmarked via its own
  // chip before being swiped must not be un-saved by the same gesture that
  // saves everyone else's.
  const handleSave = useCallback(() => {
    if (!saved) toggleSave();
    advance();
  }, [saved, toggleSave, advance]);
  const handlePass = useCallback(() => {
    advance();
  }, [advance]);

  // A non-host approved participant of an event that hasn't wrapped — the one
  // state that offers "Leave event". Reusing `primaryLabel` rather than
  // re-deriving isHost/isParticipant/wrapped here: "Open chat" is already
  // exactly that condition (see useEventCard's primaryLabel derivation).
  const canLeave = primaryLabel === 'Open chat';
  const isMember = gate === 'none';

  if (!deal) return null;

  const visibleIds = deal.ids.slice(deal.index, deal.index + STACK_DEPTH + 1);
  const cards = visibleIds.map((id, i) => {
    const isTop = i === 0;
    return {
      key: id,
      front: !isTop ? (
        <BackgroundFace id={id} />
      ) : event ? (
        <EventCard
          event={event}
          blurred
          // Empty only for a wrapped event the viewer never joined — the same
          // case the sheet rendered `null` for (no CTA at all, not a
          // blank-label button).
          action={
            primaryLabel ? (
              <Button
                label={primaryLabel}
                onPress={onPrimary}
                fullWidth
                size="md"
                variant={
                  gate === 'full' || gate === 'womenOnly' || gate === 'pending'
                    ? 'tertiary'
                    : 'primary'
                }
                disabled={gate === 'full' || gate === 'womenOnly'}
              />
            ) : undefined
          }
          onSave={toggleSave}
          onShare={() => shareEvent(event)}
          saved={saved}
        />
      ) : (
        <View style={styles.placeholder}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ),
      back:
        isTop && event ? (
          <EventCardBack
            event={event}
            isMember={isMember}
            onOpenEvent={(openId) => dealCard([openId], 0, null)}
            secondaryActions={
              canLeave ? (
                <Button
                  label="Leave event"
                  variant="tertiary"
                  onPress={() => setConfirmLeave(true)}
                  disabled={leave.isPending}
                />
              ) : undefined
            }
          />
        ) : null,
    };
  });

  return (
    <>
      {/* No absoluteFill/box-none wrapper here — `DealtCard` already renders
          one at its own root, and the popups below are `Modal`-based
          (`Sheet`/`Dialog` over `Overlay`), which paint into their own native
          layer regardless of where they sit in this tree. The tabs layout is
          what still needs that wrapper, around this whole component — see
          its comment. */}
      <DealtCard
        cards={cards}
        origin={deal.origin}
        onPass={handlePass}
        onSave={handleSave}
        onDismiss={close}
      />

      {current && (
        <SafetyPopup
          visible
          icon={current.icon}
          accent={current.accent}
          tint={current.tint}
          title={current.title}
          body={current.body}
          primaryLabel={current.primaryLabel}
          onPrimary={confirmQueued}
          secondaryLabel={current.secondaryLabel}
          onSecondary={
            current.secondaryLabel ? handleViewHostProfile : undefined
          }
          onClose={dismissQueue}
        />
      )}

      {/* Leave, step 1: confirm. Backdrop-tap can't dismiss a destructive
          action — same rule the old sheet's leave dialog used. This card
          skips the sheet's second step (a free-text reason) — a scope cut
          for this task, not a design decision; see the task report. */}
      <Dialog
        visible={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        dismissOnBackdropPress={false}
      >
        <Text style={styles.leaveTitle}>Leave this event?</Text>
        <Text style={styles.leaveBody}>
          {"You'll lose your spot and drop out of the event chat."}
        </Text>
        <View style={styles.leaveButtons}>
          <Button
            label="Stay"
            variant="tertiary"
            size="md"
            style={styles.leaveButton}
            onPress={() => setConfirmLeave(false)}
          />
          <Button
            label="Yes, leave"
            variant="secondary"
            size="md"
            style={styles.leaveButton}
            onPress={() => {
              leave.mutate();
              setConfirmLeave(false);
            }}
          />
        </View>
      </Dialog>
    </>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.section,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  leaveBody: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    lineHeight: 17,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING[2],
  },
  leaveButtons: {
    flexDirection: 'row',
    gap: SPACING[2],
    alignSelf: 'stretch',
    marginTop: SPACING[4],
  },
  leaveButton: { flex: 1 },
});
