import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { ActivityMoment } from '@/types/models';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { PressableScale } from '@/components/ui';

// The stories-style rail at the top of the Live feed: every event that's LIVE
// right now, as a tappable ring. It's the FOMO engine — the one glance that
// answers "is anything going on?". Fed the live_now moments the feed already
// loaded, so it costs no extra query.
export default function HappeningNowRail({
  live,
  onPressEvent,
}: {
  live: ActivityMoment[];
  onPressEvent: (eventId: string) => void;
}) {
  if (live.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <View style={styles.greenDot} />
        <Text style={styles.label}>Happening now</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {live.map((m) => {
          const activity = ACTIVITY_MAP[m.activity];
          const cat = categoryStyle(m.activity);
          return (
            <PressableScale
              key={m.moment_id}
              scaleTo={0.94}
              style={styles.story}
              onPress={() => onPressEvent(m.event_id)}
            >
              <View style={styles.ring}>
                <View style={styles.ringInner}>
                  {m.image_url ? (
                    <Image
                      source={{ uri: m.image_url }}
                      style={styles.thumb}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: cat.tint }]}>
                      <Text style={styles.thumbEmoji}>{activity.emoji}</Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={styles.storyLabel} numberOfLines={1}>
                {m.title}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

const RING = 62;

const styles = StyleSheet.create({
  wrap: { paddingTop: 6 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.online },
  label: {
    fontFamily: FONTS.heavy,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
  },
  rail: { paddingHorizontal: 16, gap: 12 },
  story: { width: RING, alignItems: 'center' },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    padding: 3,
    backgroundColor: COLORS.primary,
  },
  ringInner: {
    flex: 1,
    borderRadius: RING / 2,
    borderWidth: 2.5,
    borderColor: COLORS.background,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbEmoji: { fontSize: 22 },
  storyLabel: {
    marginTop: 6,
    fontFamily: FONTS.bold,
    fontSize: 10.5,
    color: COLORS.textSecondary,
    maxWidth: RING + 4,
  },
});
