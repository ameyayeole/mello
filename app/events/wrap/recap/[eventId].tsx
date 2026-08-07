import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RADIUS, SPACING } from '@/constants/spacing';
import { Image } from 'expo-image';
import { queryKeys } from '@/constants/queryKeys';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useWrap, useWrapSummary } from '@/hooks/useWrap';
import { useWrapGallery } from '@/hooks/useWrapGallery';
import { useWrapNotes } from '@/hooks/useWrapNotes';
import { SealedNoteRow } from '@/components/wrap/SealedNoteRow';
import { recapSections } from '@/utils/wrapRecap';
import { getEventDetail } from '@/services/events.service';
import { SUPERLATIVE_MAP } from '@/constants/superlatives';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Avatar, Loader, NavButton, PressableScale } from '@/components/ui';
import { SuperlativeWinner } from '@/types/models';
import { themedStyles } from '@/theme';

function StatCard({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AwardCard({ winner }: { winner: SuperlativeWinner }) {
  const meta = SUPERLATIVE_MAP[winner.category];
  return (
    <View style={styles.awardCard}>
      <Avatar
        name={winner.winner_name}
        photoUrl={winner.winner_photo_url}
        size={52}
      />
      <Text style={styles.awardName} numberOfLines={1}>
        {winner.winner_name ?? '—'}
      </Text>
      <Text style={styles.awardLabel} numberOfLines={1}>
        {meta?.label?.toUpperCase() ?? ''}
      </Text>
    </View>
  );
}

// The one dark, celebratory moment — and the only screen that is half public
// and half private. Everything above the "yours" divider is the same for every
// attendee; everything below it is scoped to the viewer by RLS.
//
// The split comes from recapSections (src/utils/wrapRecap.ts) and `summary` is
// deliberately NOT read directly below — that is how a private field ends up
// above the line, and a leak here renders as a perfectly good-looking page.
export default function WrapRecapScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const summaryQuery = useWrapSummary(eventId, true);
  const summary = summaryQuery.data;
  const { status } = useWrap(eventId);
  const { sortedPhotos } = useWrapGallery(eventId);
  const { notesQuery, open } = useWrapNotes();

  const sections = summary ? recapSections(summary, status) : null;

  // Notes are fetched for the whole inbox, so narrow them to this event.
  const eventNotes = (notesQuery.data ?? []).filter(
    (n) => n.event_id === eventId
  );

  // A viewer with no thumbs and no notes should not see a "yours" heading
  // over nothing.
  const hasYours =
    !!sections && (sections.yours.thumbsReceived > 0 || eventNotes.length > 0);

  const { data: event } = useQuery({
    queryKey: queryKeys.eventDetail.of(eventId),
    queryFn: () => getEventDetail(eventId!),
    enabled: !!eventId,
  });

  const dateLabel = event?.starts_at
    ? new Date(event.starts_at).toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : '';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {/* confetti — kept to the clear upper-right so it never sits on the text */}
      <View style={[styles.confetti, { top: 150, right: 34, backgroundColor: COLORS.primary }]} />
      <View style={[styles.confetti, styles.square, { top: 205, right: 70, backgroundColor: COLORS.secondary }]} />
      <View style={[styles.confetti, { top: 120, right: 96, width: 8, height: 8, backgroundColor: COLORS.success }]} />
      <View style={[styles.confetti, styles.square, { top: 250, right: 40, backgroundColor: COLORS.catCoffee }]} />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <NavButton
            color={COLORS.white}
            onPress={() => router.back()}
            accessibilityLabel="Back"
          />
        </View>

        {summaryQuery.isLoading || !summary || !sections ? (
          <View style={styles.center}>
            <Loader inline />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Lottie L5 (wrap unlock) plays here on first open. See
                docs/superpowers/specs/2026-08-07-wrap-lottie-manifest.md. */}
            <Animated.View entering={FadeInDown.duration(350)}>
              <Text style={styles.overline}>That&apos;s a wrap</Text>
              <Text style={styles.title}>{event?.title ?? 'Your night'}</Text>
              {(dateLabel || event?.host?.name) && (
                <Text style={styles.subtitle}>
                  {[dateLabel, event?.host?.name ? `hosted by ${event.host.name}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              )}
            </Animated.View>

            <Text style={styles.divider}>The night</Text>

            <Animated.View
              entering={FadeInDown.delay(80).duration(350)}
              style={styles.stats}
            >
              <StatCard
                value={sections.shared.photoCount}
                label="Photos"
                color={COLORS.primary}
              />
              <StatCard
                value={sections.shared.attendeeCount}
                label="People"
                color={COLORS.secondary}
              />
              {/* "Reactions", not "Likes" — migration 077 redefined what
                  like_count counts. */}
              <StatCard
                value={sections.shared.reactionCount}
                label="Reactions"
                color={COLORS.success}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(160).duration(350)}>
              <Text style={styles.sectionTitle}>Awards 🏆</Text>
              {/* Winners only. recapSections already dropped the categories
                  that never reached 3 votes — an unfiltered map renders those
                  as blank cards with no name. */}
              {sections.shared.superlatives.length > 0 ? (
                <View style={styles.awardRow}>
                  {sections.shared.superlatives.slice(0, 2).map((w) => (
                    <AwardCard key={w.category} winner={w} />
                  ))}
                </View>
              ) : (
                <Text style={styles.noVotes}>
                  No awards decided — they need 3 votes each.
                </Text>
              )}
            </Animated.View>

            {sections.shared.encoreCount > 0 && (
              <Animated.View entering={FadeInDown.delay(200).duration(350)}>
                <Text style={styles.encoreLine}>
                  {sections.shared.encoreCount}{' '}
                  {sections.shared.encoreCount === 1 ? 'person wants' : 'people want'}{' '}
                  to run it back
                </Text>
              </Animated.View>
            )}

            {sortedPhotos.length > 0 && (
              <Animated.View
                entering={FadeInDown.delay(220).duration(350)}
                style={styles.photoStrip}
              >
                {sortedPhotos.slice(0, 3).map((p, i) => {
                  const extra = sortedPhotos.length - 3;
                  const isLast = i === 2 && extra > 0;
                  return (
                    <PressableScale
                      key={p.id}
                      scaleTo={0.96}
                      style={styles.photoTile}
                      onPress={() =>
                        router.push(`/events/wrap/gallery/${eventId}`)
                      }
                    >
                      <Image
                        source={{ uri: p.url }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={150}
                      />
                      {isLast && (
                        <View style={styles.photoMore}>
                          <Text style={styles.photoMoreText}>+{extra}</Text>
                        </View>
                      )}
                    </PressableScale>
                  );
                })}
              </Animated.View>
            )}

            {/* ── Yours ────────────────────────────────────────────────────
                Everything below here is viewer-scoped BY RLS, not by this
                component: thumbs are readable only by the rater, notes only by
                their sender and recipient. Two accounts on the same event must
                see an identical half above and a different half here. */}
            {hasYours && (
              <Animated.View
                entering={FadeInDown.delay(280).duration(350)}
                style={styles.yours}
              >
                <Text style={styles.divider}>Yours</Text>

                {sections.yours.thumbsReceived > 0 && (
                  <Text style={styles.yoursLine}>
                    {sections.yours.thumbsReceived}{' '}
                    {sections.yours.thumbsReceived === 1 ? 'person' : 'people'}{' '}
                    thumbed you up
                  </Text>
                )}

                {eventNotes.length > 0 && (
                  <View style={styles.noteList}>
                    {eventNotes.map((n) => (
                      <SealedNoteRow
                        key={n.id}
                        note={n}
                        onOpen={(note) => {
                          if (!note.opened_at) open.mutate(note.id);
                        }}
                      />
                    ))}
                  </View>
                )}
              </Animated.View>
            )}
          </ScrollView>
        )}

        <View style={styles.footer}>
          <PressableScale
            scaleTo={0.97}
            style={[styles.footerBtn, styles.footerBtnGhost]}
            onPress={() => router.push(`/events/wrap/feedback/${eventId}`)}
          >
            <Text style={styles.footerBtnText}>Send a note</Text>
          </PressableScale>
          <PressableScale
            scaleTo={0.97}
            style={[styles.footerBtn, styles.footerBtnPrimary]}
            onPress={() => router.push(`/events/wrap/gallery/${eventId}`)}
          >
            <Text style={styles.footerBtnText}>See all photos</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = themedStyles(() => ({
  container: { flex: 1, backgroundColor: '#141018' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  confetti: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    zIndex: 1,
  },
  square: { width: 10, height: 10, borderRadius: 2, transform: [{ rotate: '20deg' }] },
  header: { paddingHorizontal: SPACING[3], paddingVertical: SPACING[1.5], zIndex: 2 },
  scroll: { paddingHorizontal: SPACING[5], paddingTop: SPACING[2.5], gap: SPACING[6], paddingBottom: SPACING[5] },
  overline: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: COLORS.primary,
  },
  title: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.display,
    lineHeight: 35,
    letterSpacing: -1,
    color: '#fff',
    marginTop: SPACING[2],
  },
  subtitle: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: 'rgba(255,255,255,0.5)',
    marginTop: SPACING[2],
  },
  stats: { flexDirection: 'row', gap: SPACING[2.5] },
  statCard: { flex: 1, borderRadius: RADIUS['2xl'], paddingVertical: SPACING[4], paddingHorizontal: SPACING[3.5] },
  statValue: { fontFamily: FONTS.heading, fontSize: TYPE_SIZE.h1, color: '#fff' },
  statLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: 'rgba(255,255,255,0.85)',
    marginTop: SPACING[0.5],
  },
  sectionTitle: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.body,
    color: '#fff',
    marginBottom: SPACING[3],
  },
  // The line between what everyone sees and what only you do.
  divider: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)',
  },
  encoreLine: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: 'rgba(255,255,255,0.7)',
  },
  yours: { gap: SPACING[3] },
  yoursLine: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.bodyMd,
    color: '#fff',
  },
  noteList: { gap: SPACING[2] },
  awardRow: { flexDirection: 'row', gap: SPACING[2.5] },
  awardCard: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: RADIUS.xl,
    padding: SPACING[3.5],
  },
  awardName: { fontFamily: FONTS.heading, fontSize: TYPE_SIZE.bodySm, color: '#fff' },
  awardLabel: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.nano, color: COLORS.primary },
  noVotes: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: 'rgba(255,255,255,0.6)',
  },
  photoStrip: { flexDirection: 'row', gap: SPACING[2] },
  photoTile: {
    flex: 1,
    height: 60,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  photoMore: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20,16,24,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoMoreText: { fontFamily: FONTS.heading, fontSize: TYPE_SIZE.body, color: '#fff' },
  footer: {
    flexDirection: 'row',
    gap: SPACING[2.5],
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[3.5],
    paddingBottom: SPACING[7],
  },
  footerBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING[3.5],
    borderRadius: RADIUS.md,
  },
  footerBtnGhost: { backgroundColor: 'rgba(255,255,255,0.12)' },
  footerBtnPrimary: { backgroundColor: COLORS.primary },
  footerBtnText: { fontFamily: FONTS.heading, fontSize: TYPE_SIZE.bodyMd, color: '#fff' },
}));
