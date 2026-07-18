import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { ActivityMoment } from '@/types/models';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { formatEventTime } from '@/utils/time';
import { formatDistance } from '@/utils/distance';
import { shortLocation } from '@/utils/location';
import { BOOST_ACCENT, BOOST_EMOJI, BOOST_TINT } from '@/utils/boost';
import { Avatar, Icon, PressableScale } from '@/components/ui';

// A single row in the Explore "Live" feed. One component, three layouts keyed
// off moment.kind — live_now (big banner), event_joined (avatar-stack row) and
// event_boosted (compact hot row). Tapping any of them opens the event sheet.
export default function MomentCard({
  moment,
  onPress,
}: {
  moment: ActivityMoment;
  onPress: () => void;
}) {
  const activity = ACTIVITY_MAP[moment.activity];
  const cat = categoryStyle(moment.activity);

  const place = moment.location_name ? shortLocation(moment.location_name) : null;
  const dist =
    moment.distance_m != null ? formatDistance(moment.distance_m) : null;

  // ── live_now ───────────────────────────────────────────────────────────────
  if (moment.kind === 'live_now') {
    return (
      <PressableScale style={styles.card} onPress={onPress} scaleTo={0.98}>
        <View style={styles.banner}>
          {moment.image_url ? (
            <Image
              source={{ uri: moment.image_url }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: cat.tint }]}
            >
              <Text style={styles.bannerEmoji}>{activity.emoji}</Text>
            </View>
          )}
          <View style={styles.liveTag}>
            <View style={styles.greenDot} />
            <Text style={styles.liveTagText}>
              LIVE · {moment.participant_count} here
            </Text>
          </View>
          <View style={styles.joinCta}>
            <Text style={styles.joinCtaText}>Join in →</Text>
          </View>
        </View>
        <View style={styles.liveBody}>
          <Text style={styles.verb} numberOfLines={2}>
            <Text style={styles.ev}>{moment.title}</Text> is happening now
            {place ? (
              <Text style={styles.verbMuted}> at {place}</Text>
            ) : null}
          </Text>
          {(dist || moment.friends_count > 0) && (
            <Text style={styles.sub}>
              {[
                dist,
                moment.friends_count > 0
                  ? `${moment.friends_count} ${
                      moment.friends_count === 1 ? 'friend' : 'friends'
                    } here`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          )}
        </View>
      </PressableScale>
    );
  }

  // ── event_boosted ────────────────────────────────────────────────────────
  if (moment.kind === 'event_boosted') {
    return (
      <PressableScale style={styles.card} onPress={onPress} scaleTo={0.98}>
        <View style={styles.row}>
          <Avatar
            name={moment.host_name}
            photoUrl={moment.host_photo_url}
            size={40}
          />
          <View style={styles.meta}>
            <Text style={styles.verb} numberOfLines={2}>
              <Text style={styles.ev}>{moment.title}</Text> just went{' '}
              <Text style={styles.bold}>hot</Text> {BOOST_EMOJI}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {[formatEventTime(moment.starts_at), `${moment.participant_count} going`]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <View style={styles.boostChip}>
            <Text style={styles.boostChipText}>{BOOST_EMOJI} Boosted</Text>
          </View>
        </View>
      </PressableScale>
    );
  }

  // ── event_joined ───────────────────────────────────────────────────────────
  const friendly = moment.friends_count > 0;
  const others = moment.extra_count;
  const tail = friendly
    ? ` + ${moment.friends_count} ${moment.friends_count === 1 ? 'friend' : 'friends'}`
    : others > 0
    ? ` + ${others} ${others === 1 ? 'other' : 'others'}`
    : '';

  return (
    <PressableScale style={styles.card} onPress={onPress} scaleTo={0.98}>
      <View style={styles.row}>
        <Avatar
          name={moment.actor_name}
          photoUrl={moment.actor_photo_url}
          size={40}
        />
        <View style={styles.meta}>
          <Text style={styles.verb} numberOfLines={2}>
            <Text style={styles.bold}>{moment.actor_name}</Text>
            {tail} just joined <Text style={styles.ev}>{moment.title}</Text>
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {[place, formatEventTime(moment.starts_at), dist]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <View style={[styles.catBadge, { backgroundColor: cat.tint }]}>
          <Text style={styles.catEmoji}>{activity.emoji}</Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#0F182C',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  // live banner
  banner: { height: 150, backgroundColor: COLORS.background },
  bannerEmoji: {
    fontSize: 46,
    textAlign: 'center',
    marginTop: 46,
    opacity: 0.9,
  },
  liveTag: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,24,44,0.62)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 100,
  },
  greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.online },
  liveTagText: { fontFamily: FONTS.heavy, fontSize: 11, color: '#fff' },
  joinCta: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 100,
  },
  joinCtaText: { fontFamily: FONTS.heavy, fontSize: 12.5, color: COLORS.textPrimary },
  liveBody: { padding: 13, gap: 4 },
  // shared row (joined / boosted)
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 13,
  },
  meta: { flex: 1, minWidth: 0, gap: 2 },
  verb: {
    fontFamily: FONTS.semibold,
    fontSize: 13.5,
    lineHeight: 19,
    color: COLORS.textPrimary,
  },
  verbMuted: { fontFamily: FONTS.semibold, color: COLORS.textSecondary },
  bold: { fontFamily: FONTS.heavy, color: COLORS.textPrimary },
  ev: { fontFamily: FONTS.heavy, color: COLORS.primary },
  sub: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  boostChip: {
    backgroundColor: BOOST_TINT,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 100,
  },
  boostChipText: { fontFamily: FONTS.heavy, fontSize: 10.5, color: BOOST_ACCENT },
  catBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catEmoji: { fontSize: 15 },
});
