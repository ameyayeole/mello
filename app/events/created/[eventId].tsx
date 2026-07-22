import { View, Text, StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { Easing, FadeInDown, ZoomIn } from 'react-native-reanimated';
import LottieView from 'lottie-react-native';
import { getEventDetail } from '@/services/events.service';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { formatEventWhen } from '@/utils/time';
import { shareEvent } from '@/utils/shareEvent';
import { Icon, PressableScale } from '@/components/ui';

// H1 — the celebratory "You're live!" moment right after publishing an event.
// Reached from the map create-flow; "View event" leads to the host panel.
export default function EventCreatedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  const { data: event } = useQuery({
    queryKey: queryKeys.eventDetail.of(eventId),
    queryFn: () => getEventDetail(eventId!),
    enabled: !!eventId,
  });

  const emoji = event ? ACTIVITY_MAP[event.activity]?.emoji ?? '📍' : '📍';
  const accent = event ? categoryStyle(event.activity).accent : COLORS.primary;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      {/* confetti */}
      <View style={[styles.confetti, { top: 70, left: 44, backgroundColor: COLORS.primary }]} />
      <View style={[styles.confetti, { top: 120, left: 96, width: 8, height: 8, backgroundColor: COLORS.success }]} />
      <View style={[styles.confetti, styles.square, { top: 150, right: 70, backgroundColor: COLORS.secondary }]} />
      <View style={[styles.confetti, styles.square, { top: 190, right: 130, backgroundColor: COLORS.catCoffee }]} />

      <View style={styles.center}>
        {/* Eases open once and settles — no spring overshoot. */}
        <Animated.View
          entering={ZoomIn.duration(420).easing(Easing.out(Easing.cubic))}
          style={styles.checkGlow}
        >
          <View style={styles.checkCircle}>
            <Icon name="check" size={40} color="#fff" strokeWidth={3} />
          </View>
        </Animated.View>

        <Animated.Text entering={FadeInDown.delay(120).duration(400)} style={styles.title}>
          You're live! 🎉
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(180).duration(400)} style={styles.subtitle}>
          Your event is now on the map. We'll ping you the moment someone joins.
        </Animated.Text>

        {event && (
          <Animated.View
            entering={FadeInDown.delay(240).duration(400)}
            style={styles.summary}
          >
            <View style={[styles.summaryBadge, { borderColor: accent }]}>
              <Text style={{ fontSize: TYPE_SIZE.sectionLg }}>{emoji}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.summaryTitle} numberOfLines={1}>
                {event.title}
              </Text>
              <Text style={styles.summaryMeta} numberOfLines={1}>
                {formatEventWhen(event.starts_at)} · {event.participant_count} going
              </Text>
            </View>
          </Animated.View>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <PressableScale
          scaleTo={0.97}
          style={styles.primaryBtn}
          onPress={() => event && shareEvent(event)}
        >
          <Icon name="share" size={17} color="#fff" strokeWidth={2.2} />
          <Text style={styles.primaryBtnText}>Share & invite friends</Text>
        </PressableScale>
        <PressableScale
          scaleTo={0.97}
          onPress={() => router.replace(`/events/host/${eventId}`)}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryBtnText}>View event</Text>
        </PressableScale>
      </View>

      {/* One-shot confetti burst over the whole screen. Non-interactive so it
          never swallows taps on the buttons underneath. */}
      <View style={styles.celebration} pointerEvents="none">
        <LottieView
          source={require('../../../assets/lottie/celebration.json')}
          autoPlay
          loop={false}
          resizeMode="cover"
          style={styles.celebrationFill}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.accent },
  celebration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
  celebrationFill: { flex: 1 },
  confetti: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
  square: { width: 10, height: 10, borderRadius: 2, transform: [{ rotate: '20deg' }] },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[7],
  },
  checkGlow: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[6],
    shadowColor: COLORS.primary,
    shadowOpacity: 0.6,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.display,
    letterSpacing: -0.8,
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: SPACING[3],
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    alignSelf: 'stretch',
    marginTop: SPACING[7],
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: RADIUS.lg,
    padding: SPACING[3],
  },
  summaryBadge: {
    width: 44,
    height: 44,
    borderRadius: RADIUS['2xl'],
    borderWidth: 2.5,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: { fontFamily: FONTS.heading, fontSize: TYPE_SIZE.body, color: '#fff' },
  summaryMeta: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: 'rgba(255,255,255,0.6)',
    marginTop: SPACING[0.5],
  },
  footer: { paddingHorizontal: SPACING[5], gap: SPACING[2.5] },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2],
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING[4],
    borderRadius: RADIUS.lg,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryBtnText: { fontFamily: FONTS.heading, fontSize: TYPE_SIZE.bodyLg, color: '#fff' },
  secondaryBtn: { alignItems: 'center', paddingVertical: SPACING[3] },
  secondaryBtnText: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.bodyMd,
    color: 'rgba(255,255,255,0.85)',
  },
});
