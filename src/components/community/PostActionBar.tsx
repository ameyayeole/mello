import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { PressableScale, Icon } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { CommunityPost } from '@/types/models';
import { useToggleLike } from '@/hooks/usePostInteractions';
import { SharePostSheet } from './SharePostSheet';

// Inline glyph controls, not Buttons — these are icon affordances, so a Button
// (which owns a label + the three-variant weight system) would be the wrong
// primitive here (AGENTS.md sanctions the bespoke case). Like is optimistic: the
// heart fills (bold Solar glyph) and the count moves on tap, before the network
// resolves. Comment opens the Phase 2b sheet via onComment; share opens the
// native sheet with a mello://post/<id> deep link (Phase 7).
export function PostActionBar({
  post,
  onComment,
  profileUserId,
  onDark = false,
}: {
  post: CommunityPost;
  onComment: (post: CommunityPost) => void;
  profileUserId?: string;
  onDark?: boolean;
}) {
  // The unlit glyph + count colour. Coral for a liked heart reads on both
  // surfaces, so only the resting state has two rungs.
  const quiet = onDark ? COLORS.textOnDark : COLORS.textMuted;
  const toggle = useToggleLike(profileUserId);
  const [shareOpen, setShareOpen] = useState(false);
  const pop = useSharedValue(1);
  // The ring that expands out from under the heart on a like. Two values, not
  // one driving both scale and opacity: the ring has to keep growing while it
  // fades, and a single value would tie the fade to the growth curve.
  const ringScale = useSharedValue(0);
  const ringOpacity = useSharedValue(0);
  // Tap counter drives the heart pop from an effect — the repo's accepted place
  // to write a shared value (TabBar/MessageBubble do the same). Writing it inside
  // the multi-statement onPress handler trips react-hooks/immutability.
  const [pulse, setPulse] = useState(0);
  const liked = post.liked_by_me;

  useEffect(() => {
    if (pulse === 0) return; // no pop on mount
    // A clean, subtle pop: a small scale-up then settle, pure timing so there is
    // no spring overshoot/bounce. ~1.12 is a nudge, not a bounce.
    pop.value = withSequence(
      withTiming(1.12, { duration: 110, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) })
    );
  }, [pulse, pop]);

  useEffect(() => {
    // Only likes get the ring. Un-liking is a correction, and celebrating one
    // reads as the app congratulating you for taking it back.
    if (pulse === 0 || !liked) return;
    ringScale.value = 0;
    ringOpacity.value = 0.5;
    ringScale.value = withTiming(1, {
      duration: 380,
      easing: Easing.out(Easing.cubic),
    });
    // Held briefly at full opacity so the ring is visible before it goes —
    // fading from frame one makes it read as a rendering artefact.
    ringOpacity.value = withDelay(60, withTiming(0, { duration: 320 }));
  }, [pulse, liked, ringScale, ringOpacity]);

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: 0.4 + ringScale.value * 1.4 }],
  }));

  return (
    <>
    <View style={styles.bar}>
      <PressableScale
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setPulse((n) => n + 1);
          toggle.mutate({ postId: post.id, liked: post.liked_by_me });
        }}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel={post.liked_by_me ? 'Unlike' : 'Like'}
      >
        <View style={styles.heartWrap}>
          {/* Behind the glyph and non-interactive — purely the tap's echo. */}
          <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
          <Animated.View style={heartStyle}>
            <Icon
              name="heart"
              variant={liked ? 'bold' : 'linear'}
              size={22}
              color={liked ? COLORS.primary : quiet}
            />
          </Animated.View>
        </View>
        {post.like_count > 0 ? (
          // Keyed on the count so each value is its own element: the old number
          // fades out as the new one fades in, instead of the text silently
          // swapping underneath.
          <Animated.Text
            key={post.like_count}
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(120)}
            // `liked` last so the coral wins over the on-dark rung when both
            // apply — a liked count is coral on either background.
            style={[
              styles.count,
              onDark && styles.countOnDark,
              liked && styles.countLiked,
            ]}
          >
            {post.like_count}
          </Animated.Text>
        ) : null}
      </PressableScale>

      <PressableScale
        onPress={() => onComment(post)}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel="Comments"
      >
        <Icon name="chat" size={20} color={quiet} />
        {post.comment_count > 0 ? (
          <Text style={[styles.count, onDark && styles.countOnDark]}>
            {post.comment_count}
          </Text>
        ) : null}
      </PressableScale>

      <PressableScale
        onPress={() => setShareOpen(true)}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel="Share"
      >
        <Icon name="share" size={20} color={quiet} />
      </PressableScale>
    </View>

    <SharePostSheet
      post={post}
      visible={shareOpen}
      onClose={() => setShareOpen(false)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: SPACING[5],
    marginTop: SPACING[4],
    minHeight: 44,
    alignItems: 'center',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    paddingVertical: SPACING[2],
    paddingHorizontal: SPACING[2],
    minHeight: 44,
  },
  heartWrap: { alignItems: 'center', justifyContent: 'center' },
  // Absolute so growing it never reflows the row the counts sit in.
  ring: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  count: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
  },
  countOnDark: { color: COLORS.white },
  countLiked: { color: COLORS.primary },
});
