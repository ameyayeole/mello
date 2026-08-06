import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator,
  Platform,
  Text,
  View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeInUp, FadeOut } from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { RADIUS, SPACING } from '@/constants/spacing';
import { useUIStore } from '@/stores/uiStore';
import { useEventCard, LEAVE_REASONS } from '@/hooks/useEventCard';
import { shareEvent } from '@/utils/shareEvent';
import { isPremium } from '@/utils/premium';
import { SafetyPopup } from '@/components/safety';
import {
  Avatar,
  Button,
  DealtCard,
  Dialog,
  Icon,
  IconButton,
  PremiumBadge,
  PressableScale,
  Sheet,
  SectionLabel,
  TextField,
} from '@/components/ui';
import { EventCard } from './EventCard';
import { EventCardBack } from './EventCardBack';
import { openEventChat } from '@/utils/chatActions';
import { themedStyles } from '@/theme';

// Lifts the card out of the React tree it is mounted in and into a layer that
// paints over the whole app — native modal routes included.
//
// This is not decoration. `EventDealtCard` is mounted once, in the root
// layout; openers like `events/wishlist` and `friends/[userId]`
// and every push-notification target live on routes stacked ABOVE that mount,
// two of them `presentation: 'modal'`. Without this the card was dealt into a
// layer behind the screen that dealt it and simply never appeared — a silent
// no-op on three screens and on any push tapped from a pushed route.
//
// `FullWindowOverlay` is the mechanism `InAppNotification` already uses for
// exactly this problem, and for the same reason: it adds its container as a
// direct subview of the key UIWindow (`RNSFullWindowOverlay.mm`'s `maybeShow`),
// so it sits above anything already presented. `addSubview` puts it on top at
// the moment it mounts, which is why the caller must render this only while a
// card is actually open — `EventDealtCard` below returns null before it gets
// here — rather than keeping it mounted empty.
//
// Two things deliberately stay OUT of here:
//
//   - Everything `Modal`-based — `Sheet`, `Dialog`, `SafetyPopup`. A `Modal`
//     presents from `[self reactViewController]`, which walks the responder
//     chain for the nearest UIViewController; the overlay's container hangs off
//     the UIWindow with no view controller above it, so that walk returns nil
//     and `presentViewController:` is a silent no-op. A dialog inside here
//     would never open.
//   - Android. `FullWindowOverlay` is iOS-only and warns when used elsewhere.
//     It isn't needed: on Android a react-native-screens modal is a fragment
//     inside the same root view, so a sibling of the root `<Stack>` already
//     paints over it.
//
// The overlay hosts its own native window, so gestures need their own
// `GestureHandlerRootView` — the app-root one does not reach into it. Same
// note as `InAppNotification`'s.
export function CardPortal({
  children,
  // Set while a `Modal`-based surface (SafetyPopup, Dialog) is open over the
  // card. Those cannot live inside the overlay — see the note above — so they
  // render in the app tree, which puts them UNDER this window-level container:
  // the sheet appeared behind the card and could not be tapped at all.
  //
  // Hidden rather than unmounted. Unmounting would tear down `DealtCard`'s
  // shared values, so dismissing the sheet would re-deal the card from its
  // origin instead of returning to the one you were already reading.
  suspended = false,
}: {
  children: ReactNode;
  suspended?: boolean;
}) {
  if (Platform.OS !== 'ios') return <>{children}</>;
  return (
    <FullWindowOverlay>
      {/* box-none: the container hit-tests through to the app wherever no
          subview was hit, so this must not swallow taps on its own. The dim
          inside `DealtCard` is a real subview and still receives them. */}
      <GestureHandlerRootView
        style={[styles.portal, suspended && styles.portalSuspended]}
        pointerEvents={suspended ? 'none' : 'box-none'}
      >
        {children}
      </GestureHandlerRootView>
    </FullWindowOverlay>
  );
}

// The dealt card for ONE event, driven entirely by `uiStore.dealtCard` — no
// props, so one instance mounted in the root layout serves every opener (a
// map pin, the home rail, a friend's profile, the wishlist): each just calls
// `uiStore.dealCard(id, origin)` and this renders whatever that produced.
// `CardPortal` above is what makes one mount enough — see its comment for the
// three screens that proved it wasn't.
//
// The swipe deck is a different surface — `EventDeck`, mounted alongside this
// one in the root layout — with its own many-deep stack, quota and undo. This
// component deals one card and closes on a swipe; it has no stack to advance
// into.
//
// Replaces the old `EventBottomSheet`/`EventSheetStack` as the app's one
// event surface (deleted; see git history for the gorhom-based original this
// design ported from).
export function EventDealtCard() {
  const router = useRouter();
  const deal = useUIStore((s) => s.dealtCard);
  const close = useUIStore((s) => s.closeDealtCard);

  const topId = deal?.id ?? null;
  const {
    event,
    gate,
    primaryLabel,
    primaryVariant,
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
  const insets = useSafeAreaInsets();

  // A safety queue belongs to the deal that started it. This component never
  // unmounts — it returns null when no card is dealt — so the queue survives a
  // close, and a queue left non-empty keeps `CardPortal` suspended: opacity 0,
  // still mounted, a full-screen layer over the entire app. Whatever is
  // underneath then looks frozen.
  //
  // It can be left non-empty. `startJoin` sets it and waits for the popup to be
  // answered, and the popup is a `Modal` — so anything that stops it presenting
  // (until recently: dealing this card over the wishlist's modal route) leaves a
  // queue with no UI to clear it. Clearing on every new deal, and on close, means
  // that state cannot outlive the card it belonged to.
  useEffect(() => {
    dismissQueue();
  }, [deal?.token, dismissQueue]);

  // The wishlist save/unsave toast — ported from EventBottomSheet.tsx's
  // footer toast (:800-839), which existed specifically because a silently
  // rolled-back optimistic save "reads as the button does nothing" (that
  // file's own comment). `useSaveEvent`'s optimistic rollback is still there
  // (src/hooks/useSwipeDeck.ts) but nothing surfaced its outcome once the
  // sheet was deleted — this restores that. No `ui/` primitive fit: `Sheet`/
  // `Dialog` are modal, and `InAppNotification` is a two-line title+body
  // banner that drops from the TOP and is driven by `uiStore.inAppBanner`
  // (shared across the whole app for push/system notifications) — forcing a
  // one-line bottom pill through that shape and store would be a fork, not a
  // fit. This is a single, local, transient string; built here, same as the
  // original lived only in the sheet that used it.
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1900);
    return () => clearTimeout(t);
  }, [toast]);

  // Wraps `toggleSave` with the toast, rather than moving the toast into
  // `useEventCard` itself: the hook is also reachable from contexts with no
  // card-shaped surface to float a toast over, so the outcome is surfaced
  // here, at the one place that has both the mutation and the screen. Used
  // by both the front face's bookmark chip and the browse-swipe save path
  // below — both call the same `useSaveEvent` mutation this restores
  // feedback for.
  const handleToggleSave = useCallback(() => {
    const nextSaved = !saved;
    toggleSave({
      onSuccess: () =>
        setToast(nextSaved ? 'Added to wishlist' : 'Removed from wishlist'),
      onError: () => setToast("Couldn't update wishlist"),
    });
  }, [saved, toggleSave]);

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

  // A pin's card deals exactly one event and closes on a swipe — there is no
  // stack behind it to advance into (that queue is `EventDeck` now, reached
  // from the map's own fan, not from here). Right always SAVES (never
  // toggles): a card already bookmarked via its own chip before being swiped
  // must not be un-saved by the same gesture that saves everyone else's.
  const handleSave = useCallback(() => {
    if (!saved) handleToggleSave();
    close();
  }, [saved, handleToggleSave, close]);
  const handlePass = useCallback(() => {
    close();
  }, [close]);

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

  // One card, nothing behind it. Tapping a pin, a feed card or a search
  // result is asking about a single event — dealing strangers' events out
  // behind the one you asked for made the map read like a shuffled pile
  // rather than an answer to the thing you tapped. The many-deep, quota-aware
  // stack lives on `EventDeck` now, reached from the map's own fan, not from
  // here.
  const cards = topId
    ? [
        {
          key: topId,
          front: event ? (
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
                    variant={primaryVariant}
                    disabled={gate === 'full' || gate === 'womenOnly'}
                  />
                ) : undefined
              }
              onSave={handleToggleSave}
              onShare={() => shareEvent(event)}
              saved={saved}
            />
          ) : (
            <View style={styles.placeholder}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ),
          back: event ? (
            <EventCardBack
              event={event}
              isMember={isMember}
              tooFar={gate === 'premiumDistance'}
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
                          openEventChat(event.id);
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
                            {/* secondary, not primary: this renders once per
                                pending request, so coral here would put three or
                                four "one per screen" CTAs on one surface —
                                already spoken for by the front face's Join. */}
                            <Button
                              label="Approve"
                              size="sm"
                              variant="secondary"
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
        },
      ]
    : [];

  return (
    <>
      {/* The card and its toast go through the portal; everything below is
          `Modal`-based and must not (see `CardPortal`). `DealtCard` renders
          its own absoluteFill/box-none root, so no wrapper is needed here. */}
      <CardPortal suspended={!!current || leave.step !== 'idle'}>
        <DealtCard
          // A fresh deal remounts the card; an advance does not. See
          // `DealtCardState.token` for the bug this fixes and the one it must
          // not cause.
          key={deal.token}
          cards={cards}
          origin={deal.origin}
          onPass={handlePass}
          onSave={handleSave}
          onDismiss={close}
        />

        {/* Wishlist save/unsave toast — ported from EventBottomSheet.tsx's
            footer toast. Sits over the card's own dim, inside the same portal
            layer, so no dim/backdrop of its own is needed. pointerEvents none:
            it's feedback, never a tap target. */}
        {toast && (
          <Animated.View
            entering={FadeInUp.duration(200)}
            exiting={FadeOut.duration(160)}
            style={[styles.toastWrap, { bottom: insets.bottom + SPACING[5] }]}
            pointerEvents="none"
          >
            <View style={styles.toast}>
              <Icon
                name="bookmarkFilled"
                size={15}
                color={COLORS.white}
                strokeWidth={2}
              />
              <Text style={styles.toastText}>{toast}</Text>
            </View>
          </Animated.View>
        )}
      </CardPortal>

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

const styles = themedStyles(() => ({
  // Fills the FullWindowOverlay's container so the card's own absoluteFill
  // root and the toast have something screen-sized to position against.
  portal: { flex: 1 },
  // Out of the way, not gone: see `suspended` on CardPortal.
  portalSuspended: { opacity: 0 },
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
  // ── Wishlist toast — verbatim from EventBottomSheet.tsx's `toast`/
  // `toastText`, plus `toastWrap` to position it now that there's no
  // `BottomSheetFooter` to dock it to the screen bottom.
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    paddingHorizontal: SPACING[4],
    height: 42,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  toastText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.white,
  },
}));
