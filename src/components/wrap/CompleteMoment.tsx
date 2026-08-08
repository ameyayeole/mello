import { View } from 'react-native';
import { SPACING } from '@/constants/spacing';
import Animated, { FadeIn, Easing } from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Icon } from '@/components/ui';
import { themedStyles } from '@/theme';

// The calm "task complete" moment used across the wrap: a circle fills green,
// then the tick fades in. Same language as CreateEventFlow's success state —
// no bounce.
export function CompleteMoment({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      {/* Halved from a four-stage cascade that took ~640ms to finish. The
          sequence still reads as circle-then-tick-then-words; it just stops
          making you wait through it. */}
      <Animated.View
        entering={FadeIn.duration(200).easing(Easing.out(Easing.cubic))}
        style={styles.circle}
      >
        <Animated.View entering={FadeIn.delay(100).duration(160)}>
          <Icon name="check" size={40} color="#fff" strokeWidth={3} />
        </Animated.View>
      </Animated.View>
      <Animated.Text
        entering={FadeIn.delay(150).duration(180)}
        style={styles.title}
      >
        {title}
      </Animated.Text>
      {sub ? (
        <Animated.Text
          entering={FadeIn.delay(200).duration(180)}
          style={styles.sub}
        >
          {sub}
        </Animated.Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { alignItems: 'center', gap: SPACING[2], paddingHorizontal: SPACING[7] },
  circle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[2],
    shadowColor: COLORS.success,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.title,
    letterSpacing: -0.4,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  sub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
  },
}));
