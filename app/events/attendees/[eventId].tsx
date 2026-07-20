import { useState } from 'react';
import { queryKeys } from '@/constants/queryKeys';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getEventDetail } from '@/services/events.service';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import ParticipantRow from '@/components/events/ParticipantRow';
import { PressableScale, Screen, ScreenHeader } from '@/components/ui';

type Tab = 'attendees' | 'requests';

// Full attendee / join-request list for an event the user hosts, reached from
// the host panel's "See all" links.
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

  const attendees = (event?.participants ?? []).filter(
    (p) => p.status === 'approved' && p.id !== user?.id
  );
  const requests = (event?.participants ?? []).filter(
    (p) => p.status === 'pending'
  );
  const list = tab === 'attendees' ? attendees : requests;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.eventDetail.of(eventId) });
    qc.invalidateQueries({ queryKey: queryKeys.myEvents.all });
  };

  return (
    <Screen>
      <ScreenHeader title={event?.title ?? 'Attendees'} tone="transparent" />

      {/* Tab switch */}
      <View style={styles.tabs}>
        {(['attendees', 'requests'] as Tab[]).map((t) => {
          const sel = tab === t;
          const count = t === 'attendees' ? attendees.length : requests.length;
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

      {isLoading || !event ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ParticipantRow
              eventId={event.id}
              person={item}
              onChanged={invalidate}
            />
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {tab === 'attendees'
                ? 'No attendees yet.'
                : 'No pending requests.'}
            </Text>
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  tab: {
    flex: 1,
    height: 38,
    borderRadius: 100,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: COLORS.primaryTint,
    borderColor: COLORS.primary,
  },
  tabText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: 'rgba(15,24,44,0.55)',
  },
  tabTextActive: { color: COLORS.primary },
  list: { padding: 20, paddingTop: 8, gap: 8, paddingBottom: 32 },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 30,
  },
});
