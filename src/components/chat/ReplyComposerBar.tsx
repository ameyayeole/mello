import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Icon, PressableScale } from '@/components/ui';
import type { ReplyTarget } from '@/types/models';

// What you are replying to, above the composer, until you send or cancel.
//
// It enters from below rather than fading: the bar grows out of the composer it
// belongs to, so the input moving up reads as the same movement rather than as
// something arriving on top of it.

export default function ReplyComposerBar({
  reply,
  onCancel,
}: {
  reply: ReplyTarget;
  onCancel: () => void;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(160)}
      exiting={FadeOutDown.duration(120)}
      style={styles.bar}
    >
      <View style={styles.spine} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          Replying to {reply.senderName}
        </Text>
        <Text style={styles.preview} numberOfLines={1}>
          {reply.preview || 'Message'}
        </Text>
      </View>
      <PressableScale
        scaleTo={0.85}
        onPress={onCancel}
        // A 15pt glyph is not a 44pt target; the padding is the target.
        hitSlop={10}
        accessibilityLabel="Cancel reply"
      >
        <Icon name="close" size={15} color={COLORS.textSecondary} />
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    marginHorizontal: SPACING[3.5],
    marginBottom: SPACING[1.5],
    paddingLeft: SPACING[2.5],
    paddingRight: SPACING[3],
    paddingVertical: SPACING[2],
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  spine: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  body: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.nano,
    color: COLORS.primary,
  },
  preview: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
});
