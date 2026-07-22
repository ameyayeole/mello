import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { NearbyEvent } from '@/types/models';
import { COLORS } from '@/constants/colors';
import { RADIUS, SHADOWS, SPACING } from '@/constants/spacing';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { formatEventWhen, relativeWhen } from '@/utils/time';
import type { AttendeePreview } from '@/services/events.service';
import {
  AttendeeStack,
  Button,
  Glass,
  Icon,
  PressableScale,
} from '@/components/ui';

/**
 * The one event you're hosting next, given the hero slot at the top of "Your
 * plans". A hosting-focused sibling of NearbyCard: same full-bleed photo, frost
 * band and on-photo chips, but the CTA is Manage rather than Join and there is
 * no save button — you don't wishlist your own event.
 *
 * Lifted out of the home screen when the profile sheet needed the same card.
 * It was local there with a note saying to move it the moment a second screen
 * wanted it; this is that moment.
 */
export default function FeaturedPlanCard({
  event,
  // Faces + the true approved count. Undefined until the preview RPC lands, in
  // which case we fall back to participant_count — which for a hosted event
  // counts pending requests too, so it can read a touch high until then.
  preview,
  ended = false,
  onManage,
  onShare,
  onChat,
}: {
  event: NearbyEvent;
  preview?: AttendeePreview;
  // The event is over. It still earns the slot when you have nothing coming up
  // — a finished event has a wrap, a chat and photos to collect — but the card
  // has to stop claiming it is happening. Decided by the caller, which already
  // ran `hasWrapped` to pick this event in the first place.
  ended?: boolean;
  // The primary action. Manage while it is still to come; the caller points
  // this at the wrap once it's over.
  onManage: () => void;
  onShare: () => void;
  onChat: () => void;
}) {
  const going = preview?.going_count ?? event.participant_count;
  const meta = [formatEventWhen(event.starts_at), event.location_name]
    .filter(Boolean)
    .join(' · ');

  return (
    <PressableScale style={styles.card} onPress={onManage} scaleTo={0.98}>
      {event.image_url && (
        <Image
          source={{ uri: event.image_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
        />
      )}

      <View style={styles.topRow}>
        {/* Coral says "hosting" everywhere in the app — it's the EventRow
            eyebrow's colour too — so this reads as a status, not a CTA. Once
            it's over the tense changes and the colour drops to the neutral
            on-photo glass: past tense is not a live status. */}
        {ended ? (
          <Glass tier="onPhoto" radius={RADIUS.full} style={styles.hostingPill}>
            <Text style={styles.hostingPillText}>You hosted</Text>
          </Glass>
        ) : (
          <View style={[styles.hostingPill, styles.hostingPillLive]}>
            <Text style={styles.hostingPillText}>{"You're hosting"}</Text>
          </View>
        )}
        <Glass tier="onPhoto" radius={RADIUS.full} style={styles.whenPill}>
          <Icon name="calendar" size={11} color={COLORS.white} strokeWidth={2} />
          <Text style={styles.whenText}>{relativeWhen(event.starts_at)}</Text>
        </Glass>
      </View>

      <View style={styles.body}>
        <BlurView tint="dark" intensity={34} style={StyleSheet.absoluteFill} />
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="featuredScrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={COLORS.ink} stopOpacity={0.36} />
              <Stop offset="100%" stopColor={COLORS.ink} stopOpacity={0.78} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#featuredScrim)" />
        </Svg>

        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>

        <View style={styles.goingRow}>
          <AttendeeStack
            people={preview?.attendees}
            count={going}
            size={26}
            emptyLabel={null}
          />
          {going > 0 && <Text style={styles.goingText}>going</Text>}
        </View>

        <View style={styles.footer}>
          <Button
            label={ended ? 'View wrap' : 'Manage'}
            variant="tertiary"
            size="md"
            icon={ended ? 'camera' : 'edit'}
            style={styles.manageBtn}
            onPress={onManage}
          />
          {/* On-photo icon chips, the same treatment as the card's own save
              button — IconButton's fills are built for light screens. */}
          <PressableScale
            scaleTo={0.9}
            onPress={onShare}
            accessibilityRole="button"
            accessibilityLabel="Share event"
          >
            <Glass tier="onPhoto" radius={RADIUS.md} style={styles.chip}>
              <Icon name="share" size={18} color={COLORS.white} strokeWidth={2} />
            </Glass>
          </PressableScale>
          <PressableScale
            scaleTo={0.9}
            onPress={onChat}
            accessibilityRole="button"
            accessibilityLabel="Open event chat"
          >
            <Glass tier="onPhoto" radius={RADIUS.md} style={styles.chip}>
              <Icon name="chat" size={18} color={COLORS.white} strokeWidth={2} />
            </Glass>
          </PressableScale>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 330,
    borderRadius: RADIUS['3xl'],
    overflow: 'hidden',
    backgroundColor: COLORS.accentMid,
    ...SHADOWS.photoCard,
  },
  topRow: {
    position: 'absolute',
    top: SPACING[3.5],
    left: SPACING[3.5],
    right: SPACING[3.5],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // A tag, not a button — it sits at the same weight as the EventRow eyebrow it
  // echoes (nano/uppercase), so it labels the card without competing with it.
  hostingPill: {
    paddingHorizontal: SPACING[2.5],
    paddingVertical: SPACING[1],
    borderRadius: RADIUS.full,
  },
  hostingPillLive: { backgroundColor: COLORS.primary },
  hostingPillText: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.nano,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: COLORS.white,
  },
  // Metrics track hostingPill's: the two badges share the card's top row, and a
  // pair of pills at different heights reads as a mistake rather than a hierarchy.
  whenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    paddingHorizontal: SPACING[2.5],
    paddingVertical: SPACING[1],
  },
  whenText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.white,
  },
  body: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[4],
    paddingBottom: SPACING[4],
  },
  title: {
    fontFamily: FONTS.headingBold,
    fontSize: TYPE_SIZE.titleLg,
    lineHeight: 26,
    letterSpacing: -0.4,
    color: COLORS.white,
  },
  meta: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: 'rgba(255,255,255,0.82)',
    marginTop: SPACING[1.5],
  },
  goingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    marginTop: SPACING[3],
  },
  goingText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: 'rgba(255,255,255,0.82)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    marginTop: SPACING[4],
  },
  manageBtn: { flex: 1 },
  chip: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
