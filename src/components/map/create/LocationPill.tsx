import { memo } from 'react';
import { Text,
  View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Icon } from '@/components/ui';
import { useCreateEventStore } from '@/stores/createEventStore';
import { GLYPH_STROKE } from './motion';
import { themedStyles } from '@/theme';

// Live location under the pin. Sits directly beneath the map's search bar
// rather than riding above the card, so the address reads next to the field
// you'd retype it in.
//
// Subscribes to `locationName` itself so the debounced reverse-geocode that
// fires on every pan re-renders one line of text instead of the whole flow.
export const LocationPill = memo(function LocationPill({ top }: { top: number }) {
  const locationName = useCreateEventStore((s) => s.locationName);

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(160)}
      style={[styles.locationPillWrap, { top }]}
      pointerEvents="none"
    >
      <View style={styles.locationPill}>
        <Icon
          name="location"
          size={13}
          color={COLORS.white}
          strokeWidth={GLYPH_STROKE}
        />
        <Text style={styles.locationText} numberOfLines={1}>
          {locationName || 'Locating…'}
        </Text>
      </View>
    </Animated.View>
  );
});

const styles = themedStyles(() => ({
  // Floats free under the search bar; `top` is supplied by the caller from the
  // safe-area inset so it clears the notch on every device.
  locationPillWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    maxWidth: '86%',
    height: 34,
    paddingHorizontal: SPACING[3.5],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  locationText: {
    flexShrink: 1,
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.white,
  },
}));
