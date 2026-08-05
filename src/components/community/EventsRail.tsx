import { useRef } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { PressableScale } from '@/components/ui';
import { useNearbyEvents } from '@/hooks/useNearbyEvents';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';
import { formatEventWhen } from '@/utils/time';
import { eventImageUri } from '@/utils/events';
import { themedStyles } from '@/theme';

const MAX_CARDS = 8;

// "Happening in {city}" — a horizontal strip of nearby events woven into the
// Community feed roughly every ~9 posts. Events are a distinct module, never
// peer post cards (spec §8), and always the viewer's city — a cross-city post
// never drags another city's events in. Absent entirely when nothing is nearby
// (no empty shelf). A compact card is bespoke here because EventRow is a full-
// width list row, not a horizontal tile (same call the profile wishlist made).
export function EventsRail() {
  const city = useAuthStore((s) => s.user?.city);
  const { data: events = [] } = useNearbyEvents();
  // One measurable wrapper per card, keyed by event id — measured at tap time
  // for the dealt card's origin.
  const cardRefs = useRef<Record<string, View | null>>({});

  const cards = events.slice(0, MAX_CARDS);
  if (cards.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>
        Happening in {city ?? 'your area'}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.bleed}
        contentContainerStyle={styles.row}
      >
        {cards.map((e) => {
          const cat = categoryStyle(e.activity);
          const emoji = ACTIVITY_MAP[e.activity]?.emoji ?? '📍';
          const imageUri = eventImageUri(e);
          return (
            <View
              key={e.id}
              ref={(el) => {
                cardRefs.current[e.id] = el;
              }}
              collapsable={false}
            >
              <PressableScale
                scaleTo={0.96}
                style={styles.card}
                onPress={() => {
                  const node = cardRefs.current[e.id];
                  if (!node) {
                    useUIStore.getState().dealCard(e.id, null);
                    return;
                  }
                  node.measureInWindow((x, y, width, height) => {
                    useUIStore
                      .getState()
                      .dealCard(e.id, { x, y, width, height });
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel={e.title}
              >
                <View style={[styles.media, { backgroundColor: cat.tint }]}>
                  {imageUri ? (
                    <Image
                      source={{ uri: imageUri }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : (
                    <Text style={styles.emoji}>{emoji}</Text>
                  )}
                </View>
                <View style={styles.body}>
                  <Text style={styles.title} numberOfLines={2}>
                    {e.title}
                  </Text>
                  <Text style={styles.time} numberOfLines={1}>
                    {formatEventWhen(e.starts_at)}
                  </Text>
                </View>
              </PressableScale>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { marginVertical: SPACING[2], gap: SPACING[2.5] },
  heading: {
    fontFamily: FONTS.headingBold,
    fontSize: TYPE_SIZE.section,
    letterSpacing: -0.3,
    color: COLORS.textPrimary,
    paddingHorizontal: SPACING[1],
  },
  // Run the strip to both screen edges, cancelling the feed's horizontal pad.
  bleed: { marginHorizontal: -SPACING[5] },
  row: { gap: SPACING[2.5], paddingHorizontal: SPACING[5] },
  card: {
    width: 148,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  media: { height: 86, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: TYPE_SIZE.display },
  body: { padding: SPACING[2.5], paddingTop: SPACING[2], gap: SPACING[0.5] },
  title: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 17,
    color: COLORS.textPrimary,
  },
  time: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
  },
}));
