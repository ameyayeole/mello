import { useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import { View, Text, FlatList } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getEventDetail } from '@/services/events.service';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, inkAlpha } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import ParticipantRow from '@/components/events/ParticipantRow';
import {
  PressableScale,
  Screen,
  ScreenHeader,
  SkeletonGroup,
} from '@/components/ui';
import { themedStyles } from '@/theme';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SkeletonPersonRow } from '@/components/skeletons';

type Tab = 'attendees' | 'requests';

// Full attendee / join-request list. Reached from the host panel's "See all"
// links, and — since 2026-08-07 — from "See all attendees" on a card's back,
// which any member of the event can tap.
//
// So it has two viewers. The host gets both tabs and the row actions; everyone
// else gets the list of people they are going with, and nothing to do to them
// beyond the add-friend and message the row already offers.
export default function EventAttendeesScreen() {
  const { eventId, tab: initialTab } = useLocalSearchParams<{
    eventId: string;
    tab?: Tab;
  }>();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>(
    initialTab === 'requests' ? 'requests' : 'attendees'
  );

  const { data: event, isLoading } = useQuery({
    queryKey: queryKeys.eventDetail.of(eventId),
    queryFn: () => getEventDetail(eventId),
    enabled: !!eventId,
  });

  // RLS hides pending rows from non-hosts anyway, so the Requests tab would
  // read "Requests · 0" rather than leak — but an empty tab for a thing you
  // cannot do is still a question the screen is asking you to answer.
  const isHost = !!event && event.host_id === user?.id;

  const attendees = (event?.participants ?? []).filter(
    (p) => p.status === 'approved' && p.id !== user?.id
  );
  const requests = (event?.participants ?? []).filter(
    (p) => p.status === 'pending'
  );
  const list = isHost && tab === 'requests' ? requests : attendees;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.eventDetail.of(eventId) });
    qc.invalidateQueries({ queryKey: queryKeys.myEvents.all });
  };

  return (
    <Screen>
      <ScreenHeader title={event?.title ?? 'Attendees'} tone="transparent" />

      {/* Tab switch — the host's, and only the host's. Not rendered at all
          rather than rendered empty: `tabs` carries its own vertical padding,
          which without them is a band of nothing under the header. */}
      {isHost && (
        <View style={styles.tabs}>
          {(['attendees', 'requests'] as Tab[]).map((t) => {
            const sel = tab === t;
            const count =
              t === 'attendees' ? attendees.length : requests.length;
            return (
              <PressableScale
                key={t}
                scaleTo={0.96}
                style={[styles.tab, sel && styles.tabActive]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.tabText, sel && styles.tabTextActive]}>
                  {t === 'attendees' ? 'Attendees' : 'Requests'} · {count}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      )}

      {isLoading || !event ? (
        <Animated.View exiting={FadeOut.duration(150)}>
          <SkeletonGroup>
            <SkeletonPersonRow />
          </SkeletonGroup>
        </Animated.View>
      ) : (
        <Animated.View style={styles.fill} entering={FadeIn.duration(200)}>
          <FlatList
            data={list}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <ParticipantRow
                eventId={event.id}
                person={item}
                canManage={isHost}
                showAddFriend
                onChanged={invalidate}
              />
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {isHost && tab === 'requests'
                  ? 'No pending requests.'
                  : 'No attendees yet.'}
              </Text>
            }
          />
        </Animated.View>
      )}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  // The crossfade's container: the content fades in as one piece where the
  // skeleton faded out. `flex: 1` so wrapping a list does not collapse it.
  fill: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    gap: SPACING[2],
    paddingHorizontal: SPACING[5],
    paddingVertical: SPACING[2.5],
  },
  tab: {
    flex: 1,
    height: 38,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: inkAlpha(0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: COLORS.primaryTint,
    borderColor: COLORS.primary,
  },
  tabText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: inkAlpha(0.55),
  },
  tabTextActive: { color: COLORS.primary },
  list: {
    padding: SPACING[5],
    paddingTop: SPACING[2],
    gap: SPACING[2],
    paddingBottom: SPACING[8],
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING[7],
  },
}));
