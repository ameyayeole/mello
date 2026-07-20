import { useState } from 'react';
import { View, Text, StyleSheet, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import {
  approveParticipant,
  rejectParticipant,
  removeParticipant,
} from '@/services/events.service';
import { reportUser, ReportReason } from '@/services/moderation.service';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { EventParticipant } from '@/types/models';
import { isPremium } from '@/utils/premium';
import { SafetyPopup } from '@/components/safety';
import { Avatar, Icon, PremiumBadge, PressableScale } from '@/components/ui';
import { showError } from '@/utils/errors';

// One attendee / join-request row in the host panel. Tapping the avatar or
// name opens the person's profile. Approved attendees get message + overflow
// (remove / report) actions; pending requests get approve / decline.
export default function ParticipantRow({
  eventId,
  person,
  onChanged,
}: {
  eventId: string;
  person: EventParticipant;
  onChanged: () => void;
}) {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  // Safety popup #12: report intro shown every time before the reasons list.
  const [reportIntroVisible, setReportIntroVisible] = useState(false);

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
    router.push(`/(tabs)/chats/dm/${person.id}`);
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
      { text: 'Remove from event', style: 'destructive', onPress: confirmRemove },
      { text: 'Report', onPress: () => setReportIntroVisible(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const busy = approve.isPending || decline.isPending || remove.isPending;

  return (
    <View style={styles.row}>
      <PressableScale
        scaleTo={0.96}
        style={styles.identity}
        onPress={openProfile}
      >
        <Avatar name={person.name} photoUrl={person.photo_url} size={38} />
        <Text style={styles.name} numberOfLines={1}>
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
              color="rgba(15,24,44,0.55)"
              strokeWidth={2}
            />
          </PressableScale>
        </>
      ) : (
        <>
          <PressableScale
            scaleTo={0.92}
            style={styles.iconBtn}
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
              color="rgba(15,24,44,0.55)"
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.07)',
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  name: {
    flexShrink: 1,
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  approveBtn: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: { fontFamily: FONTS.bold, color: '#fff', fontSize: 12.5 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F0F1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
