import { useCallback, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import { useUIStore } from '@/stores/uiStore';
import { useEventCard, LEAVE_REASONS } from '@/hooks/useEventCard';
import { useRecordSwipe } from '@/hooks/useSwipeDeck';
import { shareEvent } from '@/utils/shareEvent';
import { isPremium } from '@/utils/premium';
import { SafetyPopup } from '@/components/safety';
import {
  Avatar,
  Button,
  DealtCard,
  Dialog,
  IconButton,
  PremiumBadge,
  PressableScale,
  STACK_DEPTH,
  Sheet,
  SectionLabel,
  TextField,
} from '@/components/ui';
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
// Replaces the old `EventBottomSheet`/`EventSheetStack` as the app's one
// event surface (deleted; see git history for the gorhom-based original this
// design ported from).
export function EventDealtCard() {
  const router = useRouter();
  const deal = useUIStore((s) => s.dealtCard);
  const advance = useUIStore((s) => s.advanceDealtCard);
  const close = useUIStore((s) => s.closeDealtCard);
  const dealCard = useUIStore((s) => s.dealCard);

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
    isHost,
    pending,
    approve,
    reject,
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

  // The card's own swipe gesture, supplied to `DealtCard`. `deal.source` is
  // the discriminant Task 8 added to the dealt-card state: 'browse' (every
  // opener except the swipe deck) is generic advance-and-save/advance-only —
  // no quota, no permanent pass, so browsing the map or a feed can never
  // silently burn a user's swipes. 'swipeDeck' delegates to `useRecordSwipe`,
  // the exact same mutation the swipe screen's own `swipe()` calls (see that
  // hook's comment for why it's a standalone piece rather than the whole
  // `useSwipeDeck` — mounting that deck's queries here, globally, just to
  // reach a `swipe()` closure would run them even when nobody is swiping).
  //
  // Right always SAVES (never toggles) on the browse path: a card already
  // bookmarked via its own chip before being swiped must not be un-saved by
  // the same gesture that saves everyone else's. `recordSwipe`'s own 'like'
  // is likewise always a save, never a toggle, for the same reason.
  const recordSwipe = useRecordSwipe();
  const isSwipeDeck = deal?.source === 'swipeDeck';
  const handleSave = useCallback(() => {
    if (isSwipeDeck && topId) {
      recordSwipe(topId, 'like');
    } else if (!saved) {
      toggleSave();
    }
    advance();
  }, [isSwipeDeck, topId, recordSwipe, saved, toggleSave, advance]);
  const handlePass = useCallback(() => {
    if (isSwipeDeck && topId) {
      recordSwipe(topId, 'pass');
    }
    advance();
  }, [isSwipeDeck, topId, recordSwipe, advance]);

  // A non-host approved participant of an event that hasn't wrapped — the one
  // state that offers "Leave event" and "Check in". Reusing `primaryLabel`
  // rather than re-deriving isHost/isParticipant/wrapped here: "Open chat" is
  // already exactly that condition (see useEventCard's primaryLabel
  // derivation).
  const canLeave = primaryLabel === 'Open chat';
  // The host's equivalent secondary action — ported from EventBottomSheet.tsx's
  // actions block, which offered "Open chat" alongside "Manage event" so a
  // host didn't have to go through the management screen just to reach the
  // event's chat. "Manage event" only shows for a host whose event hasn't
  // wrapped, so this is that same condition without re-deriving `wrapped`.
  const canHostChat = isHost && primaryLabel === 'Manage event';
  const isMember = gate === 'none';
  const hasSecondaryActions =
    canHostChat || canLeave || (isHost && pending.length > 0);

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
              hasSecondaryActions ? (
                <>
                  {/* Host: chat, so managing an event doesn't require a trip
                      through the host screen just to reach its thread —
                      ported from EventBottomSheet.tsx:1381-1390. */}
                  {canHostChat && (
                    <Button
                      label="Open chat"
                      variant="tertiary"
                      onPress={() => {
                        close();
                        router.push(`/(tabs)/chats/${event.id}`);
                      }}
                    />
                  )}

                  {/* Approved guest scans to check in (hosts run the door via
                      their own management screen) — ported from
                      EventBottomSheet.tsx:1392-1402. `/events/scan/[eventId]`
                      has no other entry point in the app. */}
                  {canLeave && (
                    <Button
                      label="Check in"
                      variant="tertiary"
                      onPress={() => {
                        close();
                        router.push(`/events/scan/${event.id}`);
                      }}
                    />
                  )}

                  {/* Host: pending join requests to approve/reject — ported
                      from EventBottomSheet.tsx:1407-1446, Mello+ ranked first
                      (useEventCard's `pending` sort). `EventCardBack`'s
                      `secondaryActions` slot stays opaque — these rows are
                      built here, not inside that component. */}
                  {isHost && pending.length > 0 && (
                    <View style={styles.pendingSection}>
                      <SectionLabel>Requests · {pending.length}</SectionLabel>
                      {pending.map((p) => (
                        <View key={p.id} style={styles.pendingRow}>
                          <Avatar name={p.name} photoUrl={p.photo_url} size={38} />
                          <View style={styles.pendingNameWrap}>
                            <Text style={styles.pendingName} numberOfLines={1}>
                              {p.name}
                            </Text>
                            {isPremium(p) && <PremiumBadge size={13} />}
                          </View>
                          <Button
                            label="Approve"
                            size="sm"
                            variant="primary"
                            onPress={() => approve.mutate(p.id)}
                            disabled={approve.isPending}
                          />
                          <IconButton
                            icon="close"
                            variant="plain"
                            size={34}
                            iconSize={16}
                            accessibilityLabel="Decline request"
                            onPress={() => {
                              if (!reject.isPending) reject.mutate(p.id);
                            }}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                  {canLeave && (
                    <Button
                      label="Leave event"
                      variant="tertiary"
                      onPress={leave.start}
                      disabled={leave.isPending}
                    />
                  )}
                </>
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
          action — same rule the old sheet's leave dialog used. */}
      <Dialog
        visible={leave.step === 'confirm'}
        onClose={leave.stay}
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
            onPress={leave.stay}
          />
          <Button
            label="Yes, leave"
            variant="secondary"
            size="md"
            style={styles.leaveButton}
            onPress={leave.proceedToReason}
          />
        </View>
      </Dialog>

      {/* Leave, step 2: the reason, recorded in event_leave_feedback — ported
          from EventBottomSheet.tsx:1702-1746. */}
      <Sheet
        visible={leave.step === 'reason'}
        onClose={leave.stay}
        grabber
        keyboardAvoiding
        animation="slide"
      >
        <View style={styles.reasonSheet}>
          <Text style={styles.leaveTitle}>Why are you leaving?</Text>
          <View style={styles.reasonChips}>
            {LEAVE_REASONS.map((r) => {
              const selected = leave.reason === r;
              return (
                <PressableScale
                  key={r}
                  scaleTo={0.97}
                  onPress={() => leave.setReason(r)}
                  style={[styles.reasonChip, selected && styles.reasonChipOn]}
                >
                  <Text
                    style={[
                      styles.reasonChipText,
                      selected && styles.reasonChipTextOn,
                    ]}
                  >
                    {r}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          <TextField
            value={leave.detail}
            onChangeText={leave.setDetail}
            placeholder="Anything the host should know? (optional)"
            multiline
          />
          <Button
            label="Leave event"
            onPress={leave.confirm}
            disabled={!leave.reason || leave.isPending}
          />
        </View>
      </Sheet>
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
  reasonSheet: { padding: SPACING[5], gap: SPACING[3] },
  reasonChips: { gap: SPACING[2] },
  reasonChip: {
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderSoft,
    backgroundColor: COLORS.surface,
  },
  reasonChipOn: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.background,
  },
  reasonChipText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textSecondary,
  },
  reasonChipTextOn: { fontFamily: FONTS.bold, color: COLORS.textPrimary },
  pendingSection: { gap: SPACING[2] },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING[2.5],
  },
  pendingNameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
  },
  pendingName: {
    flexShrink: 1,
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
});
