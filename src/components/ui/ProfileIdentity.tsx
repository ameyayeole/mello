import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { SPACING, RADIUS } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Icon, PremiumBadge, VerifiedBadge } from './Icon';
import { themedStyles } from '@/theme';

// Who someone is, in the order this app always states it: name and age, then
// their handle, then their own words.
//
// One component because two surfaces render this and they must not drift: the
// wrap deck's RateCard and the profile screen at friends/[userId]. They used to
// be independent copies with different sizes, a different separator between
// username and age, and a bio on one but not always the other — so tapping a
// card to open a profile showed you the same person described two ways.
//
// `tone` rather than two components: the profile sheet is `onPhoto` glass over
// a photo (white ink), the deck card's body is an opaque surface (dark ink).
// Everything else about the block is identical.
export function ProfileIdentity({
  name,
  age,
  username,
  city,
  bio,
  verified,
  premium,
  thumbsCount,
  tone = 'ink',
  size = 'md',
  bioLines,
  style,
}: {
  name: string;
  age?: number | null;
  username?: string | null;
  // Joined onto the handle line. The deck card has no city on CoAttendee, so it
  // simply omits this — the line collapses to the handle alone.
  city?: string | null;
  bio?: string | null;
  verified?: boolean;
  premium?: boolean;
  // Omitted, the pill is not drawn — the profile screen already carries thumbs
  // in its stat row and would be saying it twice.
  thumbsCount?: number;
  tone?: 'ink' | 'onPhoto';
  size?: 'md' | 'lg';
  bioLines?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const onPhoto = tone === 'onPhoto';
  const nameStyle = [
    size === 'lg' ? styles.nameLg : styles.nameMd,
    onPhoto && styles.onPhotoName,
  ];
  const badge = size === 'lg' ? 20 : 16;

  return (
    <View style={style}>
      <View style={styles.nameRow}>
        <Text style={nameStyle} numberOfLines={1}>
          {name}
          {age != null ? `, ${age}` : ''}
        </Text>
        {verified && <VerifiedBadge size={badge} />}
        {premium && <PremiumBadge size={badge} />}
      </View>

      {username || city ? (
        <Text style={[styles.handle, onPhoto && styles.onPhotoMuted]}>
          {[username ? `@${username}` : null, city].filter(Boolean).join('  ·  ')}
        </Text>
      ) : null}

      {bio ? (
        <Text
          style={[styles.bio, onPhoto && styles.onPhotoMuted]}
          numberOfLines={bioLines}
        >
          {bio}
        </Text>
      ) : null}

      {thumbsCount != null ? (
        <View style={styles.thumbsRowWrap}>
          <View style={styles.thumbsPill}>
            <Icon name="thumbsUp" size={13} color={COLORS.primary} strokeWidth={2.2} />
            <Text style={styles.thumbsText}>{thumbsCount}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1.5] },
  nameMd: {
    flexShrink: 1,
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.title,
    letterSpacing: -0.42,
    color: COLORS.textPrimary,
  },
  nameLg: {
    flexShrink: 1,
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.display,
    lineHeight: 36,
    letterSpacing: -1,
    color: COLORS.textPrimary,
  },
  onPhotoName: { color: COLORS.white },
  handle: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  bio: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    lineHeight: 20,
    color: COLORS.textSecondary,
    marginTop: SPACING[2.5],
  },
  onPhotoMuted: { color: COLORS.textOnDark },
  thumbsRowWrap: { flexDirection: 'row', marginTop: SPACING[3] },
  thumbsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    paddingHorizontal: SPACING[2.5],
    height: 30,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryTint,
  },
  thumbsText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.primary,
  },
}));
