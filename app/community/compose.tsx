import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  Button,
  Screen,
  ScreenHeader,
  TextField,
  PressableScale,
  NavButton,
  Icon,
} from '@/components/ui';
import { PhotoGridPicker, pickPhotos } from '@/components/PhotoGridPicker';
import MentionAutocomplete, {
  activeMentionQuery,
  insertMention,
} from '@/components/chat/MentionAutocomplete';
import { useMentionSearch } from '@/hooks/useMentions';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';
import { useCreatePost, useCreatePoll } from '@/hooks/usePostMutations';
import { pinOwnPosts } from '@/hooks/useCommunityFeed';
import { NearbyEvent, PostVisibility } from '@/types/models';
import EventRow from '@/components/events/EventRow';
import { LinkEventSheet } from '@/components/community/LinkEventSheet';

const MAX = 280;
const OPTION_MAX = 80;
const PHOTO_MAX = 6;
const DURATIONS: (1 | 3 | 7)[] = [1, 3, 7];
// Show the counter only once it's worth watching, so the toolbar stays quiet
// while the author is nowhere near the ceiling.
const COUNT_VISIBLE_FROM = MAX - 60;

/**
 * Composing a post: a caption field, then whatever the author chooses to attach
 * to it — photos, a poll, one of their events.
 *
 * A screen rather than a sheet. A sheet is sized by its contents, so every
 * attachment pushed the composer taller and fought the keyboard for the same
 * space; with three of them a poll plus a linked event could not fit at all.
 * A route has the whole window and scrolls.
 *
 * Deliberately NOT a Post|Poll tab pair. Tabs say "this composer is one of two
 * fixed things", which stopped being true as soon as a third attachment
 * existed. The toolbar scales instead — a new feature adds a button, and the
 * caption stays the constant the author starts from.
 *
 * Photos and a poll are mutually exclusive because `createPoll` takes no media
 * (usePostMutations.ts), so each hides while the other is in use rather than
 * offering something the write path would silently drop. A linked event has no
 * such guard: it rides on any post (migration 070).
 */
export default function ComposePostScreen() {
  const router = useRouter();

  // A poll is attached or it isn't — there is no third mode, and a future
  // attachment means another flag plus another toolbar button, not a
  // restructure.
  const [hasPoll, setHasPoll] = useState(false);
  // The whole event, not just its id: the composer draws a preview of what's
  // attached, and re-fetching it by id to show what the picker just handed over
  // would be a round trip for data already in hand.
  const [linkedEvent, setLinkedEvent] = useState<NearbyEvent | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [options, setOptions] = useState<string[]>(['', '']);
  const [durationDays, setDurationDays] = useState<1 | 3 | 7>(3);
  const [visibility, setVisibility] = useState<PostVisibility>('friends');
  const create = useCreatePost();
  const createPoll = useCreatePoll();

  const trimmed = body.trim();
  const hasPhotos = photos.length > 0;
  const filledOptions = options.map((o) => o.trim()).filter((o) => o.length > 0);
  // Mentions only apply to a post caption; a poll body is a plain question.
  const mentionQuery = hasPoll ? null : activeMentionQuery(body);
  const people = useMentionSearch(mentionQuery);

  // Post: caption OR a photo. Poll: a question + ≥2 non-empty options.
  const canPost = hasPoll
    ? trimmed.length > 0 && filledOptions.length >= 2 && !createPoll.isPending
    : (trimmed.length > 0 || hasPhotos) &&
      trimmed.length <= MAX &&
      !create.isPending;

  const pending = hasPoll ? createPoll.isPending : create.isPending;

  async function addPhotos() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhotos(await pickPhotos(photos, PHOTO_MAX));
  }

  function addPoll() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHasPoll(true);
  }

  // Clears the options too: leaving them staged means re-adding a poll would
  // silently restore text the author had already dismissed.
  function removePoll() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHasPoll(false);
    setOptions(['', '']);
    setDurationDays(3);
  }

  function submit() {
    if (!canPost) return;
    // Arm the pin before the request is even sent, never on success. In
    // TanStack Query v5 the mutation's hook-level `onSuccess` (usePostMutations)
    // runs BEFORE the one passed to `mutate()` here, and it invalidates the feed
    // synchronously — which re-reads this flag. Setting it at submit means
    // nothing the mutation does can happen first. A post that then fails leaves
    // the flag armed with nothing to pin, which is harmless: build_feed_session
    // also requires an own post from the last 5 minutes.
    pinOwnPosts.current = true;
    const done = {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      },
      onError: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      },
    };
    // A linked event rides on either write path — it's an attachment, not a
    // kind of post (migration 070).
    const refEventId = linkedEvent?.id ?? null;
    if (hasPoll) {
      createPoll.mutate(
        {
          question: trimmed,
          options: filledOptions,
          durationDays,
          visibility,
          refEventId,
        },
        done
      );
    } else {
      create.mutate(
        { body: trimmed, visibility, media: photos, refEventId },
        done
      );
    }
  }

  return (
    <Screen modal keyboardAvoiding>
      <ScreenHeader
        title="New post"
        backIcon="close"
        onBack={() => router.back()}
        right={
          <Button
            variant="secondary"
            size="sm"
            label="Post"
            onPress={submit}
            disabled={!canPost}
            loading={pending}
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TextField
          value={body}
          onChangeText={(t) => setBody(t.slice(0, MAX))}
          placeholder={
            hasPoll
              ? 'Ask a question…'
              : hasPhotos
                ? 'Add a caption…'
                : "What's happening in your city?"
          }
          multiline
          maxLength={MAX}
          autoFocus
        />

        {/* Attachments. Each renders only once added, so an empty composer is
            just the caption field — the toolbar below is what offers them. */}
        {hasPhotos ? (
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(140)}
          >
            <PhotoGridPicker
              photos={photos}
              onChange={setPhotos}
              max={PHOTO_MAX}
              showAddTile={false}
            />
          </Animated.View>
        ) : null}

        {hasPoll ? (
          <Animated.View
            entering={FadeInDown.duration(220)}
            exiting={FadeOut.duration(150)}
            layout={LinearTransition.duration(200)}
            style={styles.attachment}
          >
            <View style={styles.attachmentHeader}>
              <Text style={styles.attachmentLabel}>Poll</Text>
              <NavButton
                icon="close"
                onPress={removePoll}
                accessibilityLabel="Remove poll"
              />
            </View>

            {options.map((opt, i) => (
              <Animated.View
                key={i}
                entering={FadeIn.duration(160)}
                exiting={FadeOut.duration(120)}
                layout={LinearTransition.duration(200)}
                style={styles.optionRow}
              >
                <View style={{ flex: 1 }}>
                  <TextField
                    value={opt}
                    onChangeText={(t) =>
                      setOptions((prev) =>
                        prev.map((o, j) => (j === i ? t.slice(0, OPTION_MAX) : o))
                      )
                    }
                    placeholder={`Option ${i + 1}`}
                    onFocus={() => Haptics.selectionAsync()}
                  />
                </View>
                {options.length > 2 ? (
                  <NavButton
                    icon="close"
                    onPress={() => {
                      Haptics.selectionAsync();
                      setOptions((prev) => prev.filter((_, j) => j !== i));
                    }}
                    accessibilityLabel={`Remove option ${i + 1}`}
                  />
                ) : null}
              </Animated.View>
            ))}

            {options.length < 4 ? (
              <PressableScale
                onPress={() => {
                  Haptics.selectionAsync();
                  setOptions((prev) => [...prev, '']);
                }}
                style={styles.addOption}
                accessibilityRole="button"
                accessibilityLabel="Add option"
              >
                <Icon name="plus" size={16} color={COLORS.primary} />
                <Text style={styles.addOptionText}>Add option</Text>
              </PressableScale>
            ) : null}

            <View style={styles.chipRow}>
              {DURATIONS.map((d) => {
                const active = durationDays === d;
                return (
                  <PressableScale
                    key={d}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setDurationDays(d);
                    }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive]}
                    >
                      {d} day{d > 1 ? 's' : ''}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </Animated.View>
        ) : null}

        {linkedEvent ? (
          <Animated.View
            entering={FadeInDown.duration(220)}
            exiting={FadeOut.duration(150)}
            layout={LinearTransition.duration(200)}
            style={styles.attachment}
          >
            <View style={styles.attachmentHeader}>
              <Text style={styles.attachmentLabel}>Event</Text>
              <NavButton
                icon="close"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setLinkedEvent(null);
                }}
                accessibilityLabel="Remove linked event"
              />
            </View>
            {/* Tapping re-opens the picker rather than navigating: leaving a
                half-written post to look at the event would lose the draft. */}
            <EventRow
              event={linkedEvent}
              cta="view"
              tone="quiet"
              photo
              onPress={() => setPickerOpen(true)}
            />
          </Animated.View>
        ) : null}

        {mentionQuery !== null ? (
          // `people` is already server-filtered for the active token; pass
          // query="" so the strip's own prefix filter doesn't drop legit
          // substring matches.
          <MentionAutocomplete
            query=""
            people={people}
            onPick={(u) => setBody((t) => insertMention(t, u))}
          />
        ) : null}

        {/* Who can see it, stated as a sentence rather than a chip pair — there
            are only two answers, so a toggle reads better than a picker. */}
        <PressableScale
          onPress={() => {
            Haptics.selectionAsync();
            setVisibility((v) => (v === 'friends' ? 'public' : 'friends'));
          }}
          style={styles.visRow}
          accessibilityRole="button"
          accessibilityLabel={`Visible to ${visibility}. Tap to change.`}
        >
          <Icon
            name={visibility === 'public' ? 'globe' : 'user'}
            size={15}
            color={COLORS.primary}
          />
          <Text style={styles.visText}>
            {visibility === 'friends'
              ? 'Friends can see this'
              : 'Anyone can see this'}
          </Text>
          <Icon name="chevronDown" size={14} color={COLORS.primary} />
        </PressableScale>
      </ScrollView>

      {/* Pinned under the scroll area, above the keyboard: the attachments stay
          reachable however long the draft gets. A new feature adds a button
          here — the reason this isn't a tab bar. */}
      <View style={styles.toolbar}>
        <View style={styles.tools}>
          <PressableScale
            onPress={addPhotos}
            disabled={hasPoll || photos.length >= PHOTO_MAX}
            style={styles.tool}
            accessibilityRole="button"
            accessibilityLabel="Add photos"
          >
            <Icon
              name="image"
              size={21}
              color={
                hasPoll || photos.length >= PHOTO_MAX
                  ? COLORS.textMuted
                  : COLORS.primary
              }
            />
          </PressableScale>

          <PressableScale
            onPress={addPoll}
            disabled={hasPhotos || hasPoll}
            style={styles.tool}
            accessibilityRole="button"
            accessibilityLabel="Add a poll"
          >
            <Icon
              name="poll"
              size={21}
              strokeWidth={2}
              color={hasPhotos || hasPoll ? COLORS.textMuted : COLORS.primary}
            />
          </PressableScale>

          <PressableScale
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPickerOpen(true);
            }}
            disabled={!!linkedEvent}
            style={styles.tool}
            accessibilityRole="button"
            accessibilityLabel="Link an event"
          >
            <Icon
              name="calendar"
              size={21}
              color={linkedEvent ? COLORS.textMuted : COLORS.primary}
            />
          </PressableScale>
        </View>

        {body.length >= COUNT_VISIBLE_FROM ? (
          <Animated.Text
            entering={FadeIn.duration(160)}
            style={[styles.count, body.length >= MAX && styles.countMax]}
          >
            {MAX - body.length}
          </Animated.Text>
        ) : null}
      </View>

      <LinkEventSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(event) => {
          setLinkedEvent(event);
          setPickerOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: SPACING[5],
    paddingTop: SPACING[3],
    gap: SPACING[4],
    paddingBottom: SPACING[6],
  },
  chipRow: { flexDirection: 'row', gap: SPACING[2] },
  chip: {
    paddingVertical: SPACING[2],
    paddingHorizontal: SPACING[4],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.inkSubtle,
  },
  chipActive: { backgroundColor: COLORS.accent },
  chipText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  chipTextActive: { color: COLORS.white },

  // Every attachment shares this frame, so each reads as one object that can be
  // removed as a unit and the next feature has somewhere obvious to sit.
  attachment: {
    gap: SPACING[2.5],
    padding: SPACING[3.5],
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  attachmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attachmentLabel: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.micro,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
  },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2] },
  addOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    paddingVertical: SPACING[1],
  },
  addOptionText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.primary,
  },

  visRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    alignSelf: 'flex-start',
  },
  visText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.primary,
  },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingHorizontal: SPACING[5],
    paddingVertical: SPACING[3],
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  // Takes the slack so the counter sits hard right.
  tools: { flexDirection: 'row', gap: SPACING[1], flex: 1 },
  tool: { padding: SPACING[1.5] },
  count: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
  },
  countMax: { color: COLORS.error },
});
