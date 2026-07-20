import { useRef, useState, useEffect } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { searchEvents } from '@/services/events.service';
import { searchUsers } from '@/services/friends.service';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { NearbyEvent, Profile } from '@/types/models';
import { formatEventTime } from '@/utils/time';
import { BOOST_ACCENT, BOOST_EMOJI, BOOST_TINT, isBoosted } from '@/utils/boost';
import EventBottomSheet, {
  EventBottomSheetRef,
} from '@/components/events/EventBottomSheet';
import {
  Avatar,
  CategoryTile,
  Icon,
  IconButton,
  PressableScale,
  Screen,
  SectionLabel,
} from '@/components/ui';

function EventResult({
  event,
  onPress,
}: {
  event: NearbyEvent;
  onPress: () => void;
}) {
  return (
    <PressableScale style={styles.row} onPress={onPress} scaleTo={0.98}>
      <CategoryTile activity={event.activity} size={38} radius={11} />
      <View style={styles.rowText}>
        <View style={styles.rowTitleRow}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {event.title}
          </Text>
          {isBoosted(event) && (
            <View style={styles.boostBadge}>
              <Text style={styles.boostBadgeText}>{BOOST_EMOJI}</Text>
            </View>
          )}
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {formatEventTime(event.starts_at)}
          {event.location_name ? ` · ${event.location_name}` : ''}
        </Text>
      </View>
      <Icon name="chevronRight" size={16} color="rgba(15,24,44,0.3)" />
    </PressableScale>
  );
}

function PersonResult({
  person,
  onPress,
}: {
  person: Profile;
  onPress: () => void;
}) {
  return (
    <PressableScale style={styles.row} onPress={onPress} scaleTo={0.98}>
      <Avatar
        name={person.name}
        photoUrl={person.photos?.[0] ?? person.photo_url}
        size={38}
      />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {person.name}
        </Text>
        {person.city ? (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {person.city}
          </Text>
        ) : null}
      </View>
      <Icon name="chevronRight" size={16} color="rgba(15,24,44,0.3)" />
    </PressableScale>
  );
}

export default function SearchScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const sheetRef = useRef<EventBottomSheetRef>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = debounced.length >= 2;

  const eventsQuery = useQuery({
    queryKey: ['searchEvents', debounced],
    queryFn: () => searchEvents(debounced),
    enabled,
  });

  const peopleQuery = useQuery({
    queryKey: ['searchPeople', debounced, user?.id],
    queryFn: () => searchUsers(debounced, user?.id),
    enabled,
  });

  const events = eventsQuery.data ?? [];
  const people = peopleQuery.data ?? [];
  const isLoading = eventsQuery.isLoading || peopleQuery.isLoading;
  const noResults =
    enabled && !isLoading && events.length === 0 && people.length === 0;

  return (
    <Screen modal>
      {/* Search bar */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Icon name="search" size={17} color="rgba(15,24,44,0.45)" />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search events & people"
            placeholderTextColor="rgba(15,24,44,0.45)"
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <IconButton
              icon="close"
              size={28}
              iconSize={14}
              onPress={() => setQuery('')}
              accessibilityLabel="Clear search"
            />
          )}
        </View>
        <Text style={styles.cancel} onPress={() => router.back()}>
          Cancel
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!enabled ? (
          <View style={styles.emptyState}>
            <Icon name="search" size={30} color="rgba(15,24,44,0.25)" />
            <Text style={styles.emptyText}>
              Search for events by name or place,{'\n'}or find people to add.
            </Text>
          </View>
        ) : isLoading ? (
          <Text style={styles.loading}>Searching…</Text>
        ) : noResults ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No results for “{debounced}”
            </Text>
          </View>
        ) : (
          <>
            {events.length > 0 && (
              <View style={styles.section}>
                <SectionLabel>Events</SectionLabel>
                {events.map((e) => (
                  <EventResult
                    key={e.id}
                    event={e}
                    onPress={() => sheetRef.current?.open(e.id)}
                  />
                ))}
              </View>
            )}
            {people.length > 0 && (
              <View style={styles.section}>
                <SectionLabel>People</SectionLabel>
                {people.map((p) => (
                  <PersonResult
                    key={p.id}
                    person={p}
                    onPress={() => router.push(`/friends/${p.id}`)}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <EventBottomSheet ref={sheetRef} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2.5],
    backgroundColor: COLORS.surface,
  },
  searchBar: {
    flex: 1,
    height: 44,
    paddingLeft: SPACING[3.5],
    paddingRight: SPACING[1.5],
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.full,
  },
  input: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  cancel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.primary,
  },
  scroll: { padding: SPACING[4], paddingBottom: SPACING[10], gap: SPACING[4] },
  section: { gap: SPACING[2.5] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.07)',
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING[3],
    paddingHorizontal: SPACING[3.5],
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1.5] },
  rowTitle: {
    flexShrink: 1,
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  boostBadge: {
    backgroundColor: BOOST_TINT,
    paddingHorizontal: SPACING[1.5],
    height: 18,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boostBadgeText: { fontSize: TYPE_SIZE.nano, color: BOOST_ACCENT },
  rowMeta: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: 'rgba(15,24,44,0.5)',
    marginTop: SPACING[0.5],
  },
  loading: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING[8],
  },
  emptyState: {
    alignItems: 'center',
    gap: SPACING[3],
    marginTop: SPACING[12],
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
