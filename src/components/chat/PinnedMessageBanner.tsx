import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Icon, PressableScale } from '@/components/ui';

// Slim pinned-message bar shown under the chat header.

export default function PinnedMessageBanner({
  senderName,
  content,
  isImage,
  isAnnouncement,
  onUnpin,
}: {
  senderName?: string;
  content: string;
  isImage?: boolean;
  isAnnouncement?: boolean;
  // Present only for users allowed to unpin.
  onUnpin?: () => void;
}) {
  return (
    <View style={styles.bar}>
      <Icon
        name={isAnnouncement ? 'megaphone' : 'pin'}
        size={15}
        color={COLORS.primary}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.label}>
          {isAnnouncement ? 'Announcement' : 'Pinned'}
          {senderName ? ` · ${senderName}` : ''}
        </Text>
        <Text style={styles.content} numberOfLines={1}>
          {isImage ? '📷 Photo' : content}
        </Text>
      </View>
      {onUnpin && (
        <PressableScale
          scaleTo={0.85}
          style={styles.unpinBtn}
          onPress={onUnpin}
          accessibilityLabel="Unpin message"
        >
          <Icon name="close" size={13} color={COLORS.textSecondary} />
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.primaryTint,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,24,44,0.06)',
  },
  label: {
    fontFamily: FONTS.bold,
    fontSize: 10.5,
    color: COLORS.primary,
  },
  content: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: COLORS.textPrimary,
    marginTop: 1,
  },
  unpinBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(15,24,44,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
