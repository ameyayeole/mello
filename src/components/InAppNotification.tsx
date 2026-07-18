import { useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIStore, InAppBanner } from '@/stores/uiStore';
import { openNotificationTarget } from '@/hooks/useNotifications';
import { NOTIFICATION_ICONS } from '@/constants/notificationStyle';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Icon, IconName } from '@/components/ui';

const HIDDEN_Y = -180;
const AUTO_HIDE_MS = 4500;

// Snapchat-style in-app notification: a Mello-styled card that drops in from
// the top while the app is open. Tap to jump to what it's about; swipe up or
// wait to dismiss. Mounted once in the root layout.
export default function InAppNotification() {
  const banner = useUIStore((s) => s.inAppBanner);
  if (!banner) return null;
  // Keyed by id so a new notification replaces the card (and restarts the
  // enter animation + auto-hide timer) even while one is showing.
  const card = <BannerCard key={banner.id} banner={banner} />;
  if (Platform.OS === 'ios') {
    // Native modal screens (create event, swipe deck, search…) sit above the
    // root layout; FullWindowOverlay floats the banner above them too. It
    // hosts a separate native window, so gestures need their own root view.
    return (
      <FullWindowOverlay>
        <GestureHandlerRootView style={styles.overlay} pointerEvents="box-none">
          {card}
        </GestureHandlerRootView>
      </FullWindowOverlay>
    );
  }
  return card;
}

function BannerCard({ banner }: { banner: InAppBanner }) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(HIDDEN_Y);
  const dismissed = useRef(false);

  const clear = useCallback(() => {
    const current = useUIStore.getState().inAppBanner;
    if (current?.id === banner.id) {
      useUIStore.getState().setInAppBanner(null);
    }
  }, [banner.id]);

  const hide = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    translateY.value = withTiming(HIDDEN_Y, { duration: 240 }, (finished) => {
      if (finished) runOnJS(clear)();
    });
  }, [clear, translateY]);

  useEffect(() => {
    translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
    const timer = setTimeout(hide, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [hide, translateY]);

  const onTap = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    useUIStore.getState().setInAppBanner(null);
    openNotificationTarget(banner.data);
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateY.value = Math.min(e.translationY, 12);
    })
    .onEnd((e) => {
      if (e.translationY < -16 || e.velocityY < -400) {
        runOnJS(hide)();
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  const tap = Gesture.Tap().onEnd((_e, success) => {
    if (success) runOnJS(onTap)();
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const style = NOTIFICATION_ICONS[banner.type] ?? {
    icon: 'bell' as IconName,
    color: COLORS.primary,
    tint: COLORS.primaryTint,
  };

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View
        style={[
          styles.wrap,
          { top: Math.max(insets.top, 12) },
          animatedStyle,
        ]}
      >
        <View style={styles.card}>
          <View style={[styles.iconCircle, { backgroundColor: style.tint }]}>
            <Icon name={style.icon} size={20} color={style.color} />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {banner.title}
            </Text>
            <Text style={styles.body} numberOfLines={2}>
              {banner.body}
            </Text>
          </View>
          <View style={styles.dot} />
        </View>
        <View style={styles.grabber} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 999,
    alignItems: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'stretch',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#0F182C',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  body: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    lineHeight: 17,
    color: 'rgba(15,24,44,0.65)',
    marginTop: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(15,24,44,0.12)',
    marginTop: 5,
  },
});
