import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useOverlayScreen } from '@/hooks/useOverlayScreen';
import { useFriends } from '@/hooks/useFriends';
import {
  getJoinedEvents,
  getMyEvents,
  searchEvents,
} from '@/services/events.service';
import { searchUsers } from '@/services/friends.service';
import ProfileBottomSheet, {
  ProfileBottomSheetRef,
} from '@/components/profile/ProfileBottomSheet';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Profile } from '@/types/models';
import EventRow from '@/components/events/EventRow';
import {
  Avatar,
  EmptyState,
  Glass,
  Icon,
  Loader,
  NavButton,
  NAV_BUTTON_SIZE,
  PressableScale,
  SectionLabel,
} from '@/components/ui';

// The height the field settles at. Its *starting* height comes from the
// hand-off, not from here — the home screen's search bar happens to be this
// tall too, and writing 54 in both places would be two numbers that have to
// agree, which is how the last transition broke.
const FIELD_HEIGHT = 54;

// Gap between the field and the close button it makes room for.
const CLOSE_GAP = SPACING[3];

// The close button appears once the field has most of the way narrowed — any
// earlier and it is sitting in space the field has not vacated yet.
const CLOSE_IN = [0.55, 0.95] as const;

// Results follow the field up rather than arriving with it.
const RESULTS_IN = [0.1, 0.85] as const;

// A search that is one letter long matches most of the database; two is where
// the results start meaning something.
const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;

// Long enough that the field has stopped moving, short enough that the keyboard
// still feels like it came up with the screen. Focusing on mount instead put the
// keyboard's own animation on top of the flight and the field's width animation
// under a live caret.
const FOCUS_DELAY_MS = 240;

function PersonRow({
  person,
  onPress,
}: {
  person: Profile;
  onPress: () => void;
}) {
  return (
    <PressableScale scaleTo={0.985} onPress={onPress}>
      <Glass tier="panel" radius={RADIUS['2xl']} style={styles.personRow}>
        <Avatar
          name={person.name}
          photoUrl={person.photos?.[0] ?? person.photo_url}
          size={46}
        />
        <View style={styles.personText}>
          <Text style={styles.personName} numberOfLines={1}>
            {person.name}
          </Text>
          {person.city ? (
            <Text style={styles.personMeta} numberOfLines={1}>
              {person.city}
            </Text>
          ) : null}
        </View>
        <Icon name="chevronRight" size={16} color={COLORS.textMuted} />
      </Glass>
    </PressableScale>
  );
}

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const user = useAuthStore((s) => s.user);
  const inputRef = useRef<TextInput>(null);
  const profileSheet = useRef<ProfileBottomSheetRef>(null);

  // Two screens in one file, because they are one object: the same field flies
  // up from home and from the Inbox, and only what it reaches differs.
  //
  //   default  every event on the map, and everyone
  //   chats    the conversations you can actually open, and everyone
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const chatMode = mode === 'chats';
  const { relationshipWith } = useFriends();

  // The field's flight up from the home screen, the results' arrival and the
  // way out — the app's overlay choreography, shared with notifications.
  const { travel, content, handoff, dismiss } = useOverlayScreen();

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), FOCUS_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const enabled = debounced.length >= MIN_QUERY;

  const eventsQuery = useQuery({
    queryKey: ['searchEvents', debounced],
    queryFn: () => searchEvents(debounced),
    enabled: enabled && !chatMode,
  });

  // Chat mode's events are the chats you're in, which the Inbox has already
  // fetched under these two keys — reading them here is a cache hit, not a
  // second round trip, and there is no server-side search to add for it.
  const joinedQuery = useQuery({
    queryKey: queryKeys.joinedEvents.of(user?.id),
    queryFn: () => getJoinedEvents(user!.id),
    enabled: !!user && chatMode,
  });
  const myEventsQuery = useQuery({
    queryKey: queryKeys.myEvents.of(user?.id),
    queryFn: () => getMyEvents(user!.id),
    enabled: !!user && chatMode,
  });

  const peopleQuery = useQuery({
    queryKey: ['searchPeople', debounced, user?.id],
    queryFn: () => searchUsers(debounced, user?.id),
    enabled,
  });

  const myChats = useMemo(() => {
    const mine = myEventsQuery.data ?? [];
    const joined = (joinedQuery.data ?? []).filter(
      (e) => !mine.some((m) => m.id === e.id)
    );
    return [...mine, ...joined];
  }, [myEventsQuery.data, joinedQuery.data]);

  const chatResults = useMemo(() => {
    if (!enabled) return [];
    const needle = debounced.toLowerCase();
    return myChats.filter(
      (e) =>
        e.title.toLowerCase().includes(needle) ||
        (e.location_name ?? '').toLowerCase().includes(needle)
    );
  }, [myChats, debounced, enabled]);

  const events = chatMode ? chatResults : (eventsQuery.data ?? []);
  const people = peopleQuery.data ?? [];
  const isLoading =
    enabled &&
    ((chatMode
      ? joinedQuery.isLoading || myEventsQuery.isLoading
      : eventsQuery.isLoading) ||
      peopleQuery.isLoading);
  const noResults =
    enabled && !isLoading && events.length === 0 && people.length === 0;

  // ── The flight ────────────────────────────────────────────────────────────
  //
  // In practice this is a rise and a narrowing: the home screen's search bar
  // already sits at this left inset and at this height, so those two legs are
  // no-ops. They are interpolated anyway, so the flight stays correct if either
  // screen's metrics move.
  //
  // Position is a transform, which costs no layout. Size cannot be faked the
  // same way — scaling the box would stretch the icon and the placeholder with
  // it — so width and height are animated as the layout props they are.
  const destX = SPACING[5];
  const destY = insets.top + SPACING[3];
  const destWidth = width - destX * 2 - NAV_BUTTON_SIZE - CLOSE_GAP;

  const hasOrigin = !!handoff;
  const fromX = handoff?.x ?? destX;
  const fromY = handoff?.y ?? destY;
  const fromWidth = handoff?.width ?? destWidth;
  const fromHeight = handoff?.height ?? FIELD_HEIGHT;

  const fieldStyle = useAnimatedStyle(() => {
    const t = travel.value;
    return {
      width: fromWidth + (destWidth - fromWidth) * t,
      height: fromHeight + (FIELD_HEIGHT - fromHeight) * t,
      transform: [
        { translateX: fromX + (destX - fromX) * t },
        { translateY: fromY + (destY - fromY) * t },
      ],
      // Nothing to fly from, so it arrives in place instead.
      opacity: hasOrigin
        ? 1
        : interpolate(t, [0, 0.4], [0, 1], Extrapolation.CLAMP),
    };
  });

  // The placeholder text on the home screen cross-fades into the live input, so
  // the field never shows two pieces of text at once mid-flight.
  const restingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(travel.value, [0, 0.35], [1, 0], Extrapolation.CLAMP),
  }));

  const inputStyle = useAnimatedStyle(() => ({
    opacity: interpolate(travel.value, [0.3, 0.7], [0, 1], Extrapolation.CLAMP),
  }));

  const closeStyle = useAnimatedStyle(() => {
    const t = interpolate(travel.value, CLOSE_IN, [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ scale: 0.7 + t * 0.3 }] };
  });

  const resultsStyle = useAnimatedStyle(() => {
    const t = interpolate(content.value, RESULTS_IN, [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateY: (1 - t) * 22 }] };
  });

  // Every way out of this screen goes through here, because every one of them
  // has to put the keyboard down *now*.
  //
  // `dismiss` deliberately holds the route open until the field has flown back
  // home — 420ms — and the keyboard only goes down when the input unmounts with
  // it. So without this the keyboard sat there for the whole exit and the tap
  // read as though nothing had happened. It is the one part of the transition
  // the system animates on its own schedule, so it has to be started first.
  const close = useCallback(
    (then?: () => void) => {
      Keyboard.dismiss();
      dismiss(then);
    },
    [dismiss]
  );

  // Events open the bottom sheet on the page underneath — the same one every
  // other feed uses — so those close this screen first. A profile is its own
  // route and is pushed on top, which puts you back in your results when you
  // come out of it rather than back on the home screen; the keyboard still goes
  // down, since you are leaving either way.
  const openEvent = (eventId: string) => {
    // In chat mode the row *is* a conversation, so it opens the thread rather
    // than the details sheet — the details are a tap away inside it.
    if (chatMode) {
      close(() => router.push(`/(tabs)/chats/${eventId}`));
      return;
    }
    useUIStore.getState().setSelectedEvent(eventId);
    close();
  };

  // A friend is someone you can already message, so chat mode takes you
  // straight there. Anyone else opens as a sheet over the results: you are
  // deciding whether to add them, not leaving to read a profile.
  const openPerson = (userId: string) => {
    if (chatMode && relationshipWith(userId).status === 'friends') {
      close(() => router.push(`/(tabs)/chats/dm/${userId}`));
      return;
    }
    if (chatMode) {
      Keyboard.dismiss();
      profileSheet.current?.open(userId);
      return;
    }
    Keyboard.dismiss();
    router.push(`/friends/${userId}`);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <Animated.View
        style={[
          styles.results,
          { paddingTop: destY + FIELD_HEIGHT + SPACING[5] },
          resultsStyle,
        ]}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + SPACING[10] },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {!enabled ? (
            <EmptyState
              icon="search"
              title="What are you after?"
              body={
                chatMode
                  ? 'Search the events you’re in, or find someone to message.'
                  : 'Search events by name or place, or find people to add.'
              }
            />
          ) : isLoading ? (
            <Loader />
          ) : noResults ? (
            <EmptyState
              icon="search"
              title={`Nothing for “${debounced}”`}
              body={
                chatMode
                  ? 'This only covers events you’re in. Try a person’s name.'
                  : 'Try a shorter word, or a place instead of a name.'
              }
            />
          ) : (
            <>
              {events.length > 0 && (
                <View style={styles.section}>
                  <SectionLabel style={styles.sectionLabel}>
                    {chatMode ? 'Event chats' : 'Events'}
                  </SectionLabel>
                  {events.map((event, i) => (
                    <Animated.View
                      key={event.id}
                      entering={FadeInDown.delay(Math.min(i, 8) * 40).duration(
                        280
                      )}
                    >
                      <EventRow
                        event={event}
                        glass
                        photo
                        cta={chatMode ? 'chat' : 'details'}
                        tone="quiet"
                        onPress={() => openEvent(event.id)}
                      />
                    </Animated.View>
                  ))}
                </View>
              )}
              {people.length > 0 && (
                <View style={styles.section}>
                  <SectionLabel style={styles.sectionLabel}>People</SectionLabel>
                  {people.map((person, i) => (
                    <Animated.View
                      key={person.id}
                      entering={FadeInDown.delay(Math.min(i, 8) * 40).duration(
                        280
                      )}
                    >
                      <PersonRow
                        person={person}
                        onPress={() => openPerson(person.id)}
                      />
                    </Animated.View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </Animated.View>

      {/* The close button. Sits where the field's right edge used to be, and
          only appears once the field has narrowed past it. A bare glyph, per
          AGENTS.md — unlike the notifications back button it is not the object
          that flew here, so it has no chip to keep. */}
      <Animated.View
        style={[
          styles.close,
          { top: destY + (FIELD_HEIGHT - NAV_BUTTON_SIZE) / 2 },
          closeStyle,
        ]}
      >
        <NavButton
          icon="close"
          onPress={() => close()}
          accessibilityLabel="Close search"
        />
      </Animated.View>

      {/* The travelling field. Absolutely positioned in *window* coordinates,
          outside any safe-area padding, because that is the space the origin was
          measured in. It is the same pane of glass that sits on the home
          screen — the one object, moved, not a copy that resembles it. */}
      <Animated.View style={[styles.field, fieldStyle]}>
        <Glass tier="panel" radius={RADIUS.lg} style={styles.fieldGlass}>
          <Icon name="search" size={18} color={COLORS.textMuted} />

          {/* Both fill the same slot and cross-fade. The resting label is what
              the home screen shows; the input is what this screen needs. Two
              layers rather than a swap, so nothing reflows mid-flight. */}
          <View style={styles.fieldSlot}>
            <Animated.Text
              style={[styles.restingText, restingStyle]}
              numberOfLines={1}
            >
              Search events & people
            </Animated.Text>
            <Animated.View style={[styles.inputWrap, inputStyle]}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                placeholder="Search events & people"
                placeholderTextColor={COLORS.placeholder}
                autoCorrect={false}
                returnKeyType="search"
              />
            </Animated.View>
          </View>

          {query.length > 0 ? (
            <PressableScale
              scaleTo={0.86}
              hitSlop={8}
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <View style={styles.clear}>
                <Icon
                  name="close"
                  size={12}
                  color={COLORS.white}
                  strokeWidth={2.6}
                />
              </View>
            </PressableScale>
          ) : null}
        </Glass>
      </Animated.View>

      {/* Someone you aren't friends with yet. It lives here, on the overlay,
          rather than on the Inbox underneath: this route is full-screen, so
          the sheet opens over the results you found them in and closing it
          puts you back there. */}
      <ProfileBottomSheet ref={profileSheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  // No background: the route is transparent, so what shows through is
  // <AppBackground>, the one already mounted behind the tab navigator and still
  // drifting. A second copy here would be a second blob at a different point in
  // its cycle, cross-fading against the first.
  root: { flex: 1 },
  results: { flex: 1 },
  scroll: { gap: SPACING[5] },
  section: { gap: SPACING[2.5], paddingHorizontal: SPACING[5] },
  sectionLabel: { marginBottom: -SPACING[0.5] },

  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingVertical: SPACING[3],
    paddingHorizontal: SPACING[3.5],
  },
  personText: { flex: 1, minWidth: 0 },
  personName: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  personMeta: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
    marginTop: SPACING[0.5],
  },

  // `left`/`top` stay at zero and the transform does the travelling, so
  // position costs no layout pass. Width and height are animated inline.
  field: { position: 'absolute', top: 0, left: 0 },
  fieldGlass: {
    flex: 1,
    paddingHorizontal: SPACING[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
  },
  fieldSlot: { flex: 1, minWidth: 0, justifyContent: 'center' },
  restingText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textMuted,
  },
  // Absolute so it shares the slot with the resting label instead of stacking
  // under it — the two are the same line of text, one live and one not.
  inputWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  input: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textPrimary,
    padding: 0,
  },
  // Ink rather than a bare glyph: it sits *inside* the field, where a bare X
  // would read as part of the text rather than as a control on it.
  clear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.textMuted,
  },
  close: { position: 'absolute', right: SPACING[5] },
});
