import { useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { View,
  Text,
  Alert,
  Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import {
  approveParticipant,
  rejectParticipant,
  removeParticipant,
} from '@/services/events.service';
import { reportUser, ReportReason } from '@/services/moderation.service';
import { useFriends } from '@/hooks/useFriends';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, inkAlpha } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { EventParticipant } from '@/types/models';
import { isPremium } from '@/utils/premium';
import { SafetyPopup } from '@/components/safety';
import { Avatar, Icon, PremiumBadge, PressableScale } from '@/components/ui';
import { showError } from '@/utils/errors';
import { openDmChat } from '@/utils/chatActions';
import { themedStyles } from '@/theme';

// One attendee / join-request row in the host panel. Tapping the avatar or
// name opens the person's profile. Approved attendees get message + overflow
// (remove / report) actions; pending requests get approve / decline.
export default function ParticipantRow({
  eventId,
  person,
  onChanged,
  surface = 'card',
  first = false,
  showAddFriend = false,
  canManage = true,
}: {
  eventId: string;
  person: EventParticipant;
  onChanged: () => void;
  /**
   * `card` — its own surface, as on the attendees screen.
   * `row` — transparent, inside one shared lift, with a divider above it.
   *
   * A prop, not a fork. Six attendees on the host panel is one surface, not six
   * cards; the attendees screen keeps `card` and neither has to know about the
   * other's container.
   */
  surface?: 'card' | 'row';
  /** First in a `row` stack — no divider above it. */
  first?: boolean;
  /**
   * Offer add-friend. Attendees only: you connect with people after you have
   * let them in, so a request row keeps Approve / ✕ and nothing else.
   */
  showAddFriend?: boolean;
  /**
   * The viewer runs this event. Defaults true because every original caller of
   * this row was the host panel — the attendee list is now also reachable by
   * the attendees themselves, and "Remove from event" on a row you cannot
   * remove is an option that only exists to fail against RLS.
   */
  canManage?: boolean;
}) {
  const onDark = surface === 'row';
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  // Safety popup #12: report intro shown every time before the reasons list.
  const [reportIntroVisible, setReportIntroVisible] = useState(false);

  // What we already are to this person, from the one cached friendships list
  // `useFriends` keeps for the whole app — not a query per row. The glyph has to
  // already know friend / pending / none, or it offers to add someone you added
  // last week.
  const { relationshipWith, sendRequest } = useFriends();
  const relationship = relationshipWith(person.id).status;
  const canAdd = showAddFriend && relationship === 'none' && me?.id !== person.id;
  const connected = showAddFriend && relationship !== 'none';

  const approve = useMutation({
    mutationFn: () => approveParticipant(eventId, person.id),
    onSuccess: onChanged,
    onError: (e) => showError(e),
  });

  const decline = useMutation({
    mutationFn: () => rejectParticipant(eventId, person.id),
    onSuccess: onChanged,
    onError: (e) => showError(e),
  });

  const remove = useMutation({
    mutationFn: () => removeParticipant(eventId, person.id),
    onSuccess: onChanged,
    onError: (e) => showError(e),
  });

  const report = useMutation({
    mutationFn: (reason: ReportReason) => reportUser(me!.id, person.id, reason),
    onSuccess: () =>
      Alert.alert('Report sent', 'Thanks — our team will review this.'),
    onError: (e) => showError(e),
  });

  function openProfile() {
    router.push(`/friends/${person.id}`);
  }

  function openMessage() {
    openDmChat(person.id);
  }

  function confirmRemove() {
    Alert.alert(
      'Remove attendee',
      `Remove ${person.name} from this event? They won't be notified, but they'll lose access to the event chat.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => remove.mutate(),
        },
      ]
    );
  }

  function showReportReasons() {
    Alert.alert(`Report ${person.name}`, 'Why are you reporting them?', [
      { text: 'Spam', onPress: () => report.mutate('spam') },
      { text: 'Harassment', onPress: () => report.mutate('harassment') },
      {
        text: 'Inappropriate content',
        onPress: () => report.mutate('inappropriate'),
      },
      { text: 'Fake profile', onPress: () => report.mutate('fake_profile') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function openMenu() {
    Alert.alert(person.name, undefined, [
      ...(canManage
        ? [
            {
              text: 'Remove from event',
              style: 'destructive' as const,
              onPress: confirmRemove,
            },
          ]
        : []),
      { text: 'Report', onPress: () => setReportIntroVisible(true) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  const busy = approve.isPending || decline.isPending || remove.isPending;

  return (
    <View
      style={[
        surface === 'card' ? styles.row : styles.rowFlat,
        surface === 'row' && !first && styles.rowDivider,
      ]}
    >
      <PressableScale
        scaleTo={0.96}
        style={styles.identity}
        onPress={openProfile}
      >
        <Avatar name={person.name} photoUrl={person.photo_url} size={38} />
        <Text
          style={[styles.name, onDark && styles.nameOnDark]}
          numberOfLines={1}
        >
          {person.name}
        </Text>
        {isPremium(person) && <PremiumBadge size={13} />}
      </PressableScale>

      {person.status === 'pending' ? (
        <>
          <PressableScale
            scaleTo={0.92}
            style={styles.approveBtn}
            onPress={() => approve.mutate()}
            disabled={busy}
          >
            <Text style={styles.approveBtnText}>Approve</Text>
          </PressableScale>
          <PressableScale
            scaleTo={0.92}
            style={styles.iconBtn}
            onPress={() => decline.mutate()}
            disabled={busy}
            accessibilityLabel="Decline request"
          >
            <Icon
              name="close"
              size={16}
              color={inkAlpha(0.55)}
              strokeWidth={2}
            />
          </PressableScale>
        </>
      ) : (
        <>
          {(canAdd || connected) && (
            <PressableScale
              scaleTo={0.92}
              style={[styles.iconBtn, onDark && styles.iconBtnOnDark]}
              onPress={() => canAdd && sendRequest.mutate(person.id)}
              disabled={!canAdd || sendRequest.isPending}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                canAdd
                  ? `Add ${person.name} as a friend`
                  : `Already connected with ${person.name}`
              }
            >
              <Icon
                name={canAdd ? 'userPlus' : 'check'}
                size={16}
                color={
                  canAdd
                    ? onDark
                      ? COLORS.white
                      : COLORS.textPrimary
                    : onDark
                      ? COLORS.textOnDarkMuted
                      : COLORS.textMuted
                }
                strokeWidth={2}
              />
            </PressableScale>
          )}
          <PressableScale
            scaleTo={0.92}
            style={[styles.iconBtn, onDark && styles.iconBtnOnDark]}
            onPress={openMessage}
            accessibilityLabel={`Message ${person.name}`}
          >
            <Icon name="chat" size={16} color={COLORS.primary} strokeWidth={2} />
          </PressableScale>
          <PressableScale
            scaleTo={0.92}
            style={styles.iconBtn}
            onPress={openMenu}
            disabled={busy}
            accessibilityLabel="More options"
          >
            <Icon
              name="dots"
              size={16}
              color={inkAlpha(0.55)}
              strokeWidth={2}
            />
          </PressableScale>
        </>
      )}

      {/* Safety popup #12: report intro (every time), then the reasons list. */}
      <SafetyPopup
        visible={reportIntroVisible}
        icon="flag"
        accent={COLORS.error}
        tint="#FDEAEA"
        title="Tell us what happened"
        body={
          "Reports are confidential and reviewed by our team. If you're in " +
          'immediate danger, call 112 first. Add as much detail as you can — ' +
          'it helps us act faster.'
        }
        primaryLabel="Continue report"
        onPrimary={() => {
          setReportIntroVisible(false);
          showReportReasons();
        }}
        secondaryLabel="Call 112"
        onSecondary={() => Linking.openURL('tel:112')}
        onClose={() => setReportIntroVisible(false)}
      />
    </View>
  );
}

const styles = themedStyles(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING[2.5],
    borderWidth: 1,
    borderColor: inkAlpha(0.07),
  },
  // Inside a shared lift: no surface of its own, no radius, no border — the
  // stack it sits in has all three.
  rowFlat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    paddingHorizontal: SPACING[3.5],
    paddingVertical: SPACING[2.5],
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: COLORS.borderOnDark },
  iconBtnOnDark: { backgroundColor: COLORS.fillOnDarkStrong },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    minWidth: 0,
  },
  name: {
    flexShrink: 1,
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  nameOnDark: { color: COLORS.white },
  approveBtn: {
    height: 34,
    paddingHorizontal: SPACING[3.5],
    borderRadius: RADIUS.xs,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: {
    fontFamily: FONTS.bold,
    color: COLORS.white,
    fontSize: TYPE_SIZE.caption,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.xs,
    // Was a literal `#F0F1F3` — a light grey inside a `themedStyles` factory,
    // which is exactly the bug the palette proxy cannot see: the chip stayed
    // near-white on the dark theme while the glyph inside it stayed ink.
    backgroundColor: COLORS.inkSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
