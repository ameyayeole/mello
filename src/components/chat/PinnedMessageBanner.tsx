import { View,
  Text } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS, inkAlpha } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Icon, PressableScale } from '@/components/ui';
import { themedStyles } from '@/theme';

// Slim pinned-message bar shown under the chat header.
//
// The whole bar is the tap target, and tapping it goes *to* the message. A
// pinned message that only shows you its first line is a bookmark you cannot
// open — the point of pinning "meet at 8 by the north gate" is to be able to get
// back to it, and to whatever was said around it.
//
// The unpin button sits inside that target and stops the press from reaching it:
// two actions on one surface, and the small explicit one wins.

export default function PinnedMessageBanner({
  senderName,
  content,
  isImage,
  isAnnouncement,
  onPress,
  onUnpin,
}: {
  senderName?: string;
  content: string;
  isImage?: boolean;
  isAnnouncement?: boolean;
  // Jump to the pinned message. Absent when it is no longer in the thread — the
  // bar still shows what was pinned, it just has nowhere to send you.
  onPress?: () => void;
  // Present only for users allowed to unpin.
  onUnpin?: () => void;
}) {
  return (
    <PressableScale
      scaleTo={onPress ? 0.985 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={styles.bar}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={
        onPress ? `Go to the pinned message: ${content}` : undefined
      }
    >
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
          // Wider than the glyph: it is a 13pt icon inside a bar that is itself
          // a button, so the two targets have to be told apart by a thumb.
          hitSlop={10}
          accessibilityLabel="Unpin message"
        >
          <Icon name="close" size={13} color={COLORS.textSecondary} />
        </PressableScale>
      )}
    </PressableScale>
  );
}

const styles = themedStyles(() => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2],
    backgroundColor: COLORS.primaryTint,
    borderBottomWidth: 1,
    borderBottomColor: inkAlpha(0.06),
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
    backgroundColor: inkAlpha(0.06),
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
