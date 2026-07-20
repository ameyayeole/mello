import { useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, Easing } from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Avatar, Button, Dialog, Icon, PressableScale } from '@/components/ui';
import { useFriends } from '@/hooks/useFriends';
import { WrapNote } from '@/types/models';

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(mins, 1)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// Inbox row for a wrap note. Sealed: envelope + event name, sender hidden.
// Opened: sender shown, tap re-reads the note.
export function SealedNoteRow({
  note,
  onOpen,
}: {
  note: WrapNote;
  onOpen: (note: WrapNote) => void;
}) {
  const sealed = !note.opened_at;
  return (
    <PressableScale
      scaleTo={0.98}
      style={styles.row}
      onPress={() => onOpen(note)}
      accessibilityRole="button"
      accessibilityLabel={
        sealed
          ? `Sealed note from ${note.eventTitle ?? 'an event'}`
          : `Note from ${note.sender?.name ?? 'someone'}`
      }
    >
      {sealed ? (
        <View style={styles.envelope}>
          <Text style={styles.envelopeEmoji}>💌</Text>
        </View>
      ) : (
        <Avatar name={note.sender?.name} photoUrl={note.sender?.photo_url} size={46} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          {sealed ? 'A note for you' : `Note from ${note.sender?.name ?? 'someone'}`}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {sealed
            ? `From someone at ${note.eventTitle ?? 'your last event'} · tap to open`
            : note.content}
        </Text>
      </View>
      <Text style={styles.time}>{timeAgo(note.created_at)}</Text>
      {sealed && <View style={styles.dot} />}
    </PressableScale>
  );
}

// Full-screen reveal: the note card with sender, text, photo, and Add friend
// as the only action. No reply affordance — DMs stay friends-only.
export function NoteRevealModal({
  note,
  onClose,
}: {
  note: WrapNote | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { sendRequest, relationshipWith } = useFriends();
  const [requested, setRequested] = useState(false);

  if (!note) return null;
  const rel = note.sender_id ? relationshipWith(note.sender_id) : null;
  const isFriend = rel?.status === 'friends';
  const sent = requested || rel?.status === 'request_sent';

  function openProfile() {
    onClose();
    router.push(`/friends/${note!.sender_id}`);
  }

  return (
    <Dialog visible={!!note} onClose={onClose} style={styles.card}>
      <Animated.View
        entering={FadeInDown.duration(320).easing(Easing.out(Easing.cubic))}
      >
        <Animated.View entering={FadeIn.delay(120).duration(300)} style={styles.cardInner}>
          <PressableScale scaleTo={0.97} style={styles.senderRow} onPress={openProfile}>
            <Avatar
              name={note.sender?.name}
              photoUrl={note.sender?.photo_url}
              size={44}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.senderName}>{note.sender?.name ?? 'Someone'}</Text>
              <Text style={styles.senderMeta} numberOfLines={1}>
                from {note.eventTitle ?? 'your event'}
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color="rgba(15,24,44,0.35)" />
          </PressableScale>

          <Text style={styles.noteText}>{note.content}</Text>

          {note.photo_url ? (
            <Image
              source={{ uri: note.photo_url }}
              style={styles.notePhoto}
              contentFit="cover"
              transition={200}
            />
          ) : null}

          <View style={styles.actions}>
            {isFriend ? (
              <Button
                label="Message"
                onPress={() => {
                  onClose();
                  router.push(`/(tabs)/chats/dm/${note.sender_id}`);
                }}
              />
            ) : (
              <Button
                label={sent ? 'Friend request sent' : 'Add friend to reply'}
                disabled={sent}
                onPress={() => {
                  setRequested(true);
                  sendRequest.mutate(note.sender_id);
                }}
              />
            )}
            <Text style={styles.hint}>
              Notes are one-way. Once you're friends you can chat.
            </Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingVertical: SPACING[2.5],
  },
  envelope: {
    width: 46,
    height: 46,
    borderRadius: RADIUS['3xl'],
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  envelopeEmoji: { fontSize: TYPE_SIZE.title },
  title: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  sub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  time: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  card: { overflow: 'hidden', padding: 0 },
  cardInner: { padding: SPACING[5], gap: SPACING[3.5] },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3] },
  senderName: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.bodyLg,
    letterSpacing: -0.32,
    color: COLORS.textPrimary,
  },
  senderMeta: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  noteText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyLg,
    lineHeight: 23,
    color: COLORS.textPrimary,
  },
  notePhoto: {
    width: '100%',
    height: 220,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primaryTint,
  },
  actions: { gap: SPACING[2.5], marginTop: SPACING[0.5] },
  hint: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
