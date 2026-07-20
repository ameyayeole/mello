import { useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import {
  Avatar,
  Button,
  Icon,
  NavButton,
  PressableScale,
  Sheet,
} from '@/components/ui';
import { sendWrapNote } from '@/services/wrap.service';
import { uploadChatPhoto } from '@/services/storage.service';
import { useAuthStore } from '@/stores/authStore';
import { CoAttendee } from '@/types/models';
import { errorMessage } from '@/utils/errors';

// Private note composer: text + optional photo, delivered sealed to the
// recipient's inbox. One note per person per event (DB unique).
export function NoteComposer({
  eventId,
  recipient,
  visible,
  onClose,
  onSent,
}: {
  eventId: string;
  recipient: CoAttendee | null;
  visible: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [content, setContent] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function handleSend() {
    if (!recipient || !user || !content.trim()) return;
    try {
      setSending(true);
      let photoUrl: string | null = null;
      if (photoUri) {
        photoUrl = await uploadChatPhoto(user.id, photoUri);
      }
      await sendWrapNote({
        eventId,
        senderId: user.id,
        recipientId: recipient.id,
        content: content.trim(),
        photoUrl,
      });
      setContent('');
      setPhotoUri(null);
      onSent?.();
      onClose();
    } catch (e) {
      const msg = errorMessage(e);
      Alert.alert(
        'Note not sent',
        /duplicate|unique/i.test(msg)
          ? `You already left ${recipient.name} a note for this event.`
          : msg
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      keyboardAvoiding
      style={styles.card}
    >
    <View style={styles.header}>
      <Avatar name={recipient?.name} photoUrl={recipient?.photo_url} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Note for {recipient?.name}</Text>
        <Text style={styles.sub}>
          Delivered privately. They can't reply unless you're friends.
        </Text>
      </View>
      <NavButton icon="close" onPress={onClose} accessibilityLabel="Close" />
    </View>

    <TextInput
      style={styles.input}
      placeholder="Great meeting you! That story about…"
      placeholderTextColor="rgba(15,24,44,0.40)"
      value={content}
      onChangeText={(t) => setContent(t.slice(0, 500))}
      multiline
      autoFocus
    />

    {photoUri ? (
      <View style={styles.photoRow}>
        <Image source={{ uri: photoUri }} style={styles.photoThumb} contentFit="cover" />
        <PressableScale
          scaleTo={0.9}
          style={styles.photoRemove}
          onPress={() => setPhotoUri(null)}
          accessibilityLabel="Remove photo"
        >
          <Icon name="close" size={13} color="#fff" strokeWidth={2.6} />
        </PressableScale>
      </View>
    ) : (
      <PressableScale scaleTo={0.97} style={styles.attachBtn} onPress={pickPhoto}>
        <Icon name="image" size={17} color={COLORS.primary} strokeWidth={2} />
        <Text style={styles.attachText}>Attach a photo</Text>
      </PressableScale>
    )}

    <Button
      label="Send note"
      onPress={handleSend}
      loading={sending}
      disabled={!content.trim()}
    />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { padding: SPACING[5], gap: SPACING[3.5] },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.bodyLg,
    letterSpacing: -0.32,
    color: COLORS.textPrimary,
  },
  sub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
    marginTop: SPACING[0.5],
  },
  input: {
    minHeight: 90,
    maxHeight: 160,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING[3.5],
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textPrimary,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[1.5],
    height: 42,
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    borderColor: COLORS.primaryTint,
    backgroundColor: COLORS.primaryTint,
  },
  attachText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.primary,
  },
  photoRow: { alignSelf: 'flex-start' },
  photoThumb: { width: 88, height: 88, borderRadius: RADIUS.md },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
});
