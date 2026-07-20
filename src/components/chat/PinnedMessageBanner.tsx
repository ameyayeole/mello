import { View, Text, StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
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
    gap: SPACING[2.5],
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2],
    backgroundColor: COLORS.primaryTint,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,24,44,0.06)',
  },
  label: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.nano,
    color: COLORS.primary,
  },
  content: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textPrimary,
    marginTop: SPACING[0.5],
  },
  unpinBtn: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(15,24,44,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
