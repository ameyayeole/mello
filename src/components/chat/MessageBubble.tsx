import { useEffect, useRef } from 'react';
import { View,
  Text } from 'react-native';
import Animated, {
  Easing,
  SharedValue,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS, inkAlpha } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { formatChatTime } from '@/utils/time';
import { MessageReaction, Profile } from '@/types/models';
import { Avatar, Icon, PressableScale } from '@/components/ui';
import type { BubbleAnchor } from './ReactionOverlay';
import ChatImageBubble from './ChatImageBubble';
import MentionText from './MentionText';
import ReactionPills from './ReactionPills';
import ReadRail from './ReadRail';
import ReplyQuote from './ReplyQuote';
import Ticks, { TickStatus } from './Ticks';
import {
  GLIDE,
  POP,
  POP_FROM,
  SEND_FROM,
  SQUASH_X,
  STRETCH_IN_MS,
  STRETCH_OUT_MS,
  STRETCH_Y,
} from './motion';
import { themedStyles } from '@/theme';

// The one bubble both threads render. Event chat and DM had a private copy
// each, near-identical and already drifting (the DM one had no avatar at all),
// and every feature since — grouping, reactions, read receipts — would have had
// to be written twice.
//
// It takes a normalised shape rather than a `Message` or a `DirectMessage`, so
// neither model has to grow fields for the other's sake. Announcements stay on
// the event screen: they are a full-width card, not a bubble, and there is one
// of them.

// The avatar column. Messages that aren't the last of a run keep the space so
// the run stays flush against one edge.
const AVATAR_SIZE = 26;

// How far the thread slides, and how wide the gutter it opens is. One number:
// the drag stops exactly where the times are fully clear.
export const TIME_GUTTER = 62;

// ─── Swipe right to reply ───────────────────────────────────────────────────
//
// The two horizontal drags in a thread are told apart by *direction*, and that
// is the whole of the arbitration: this one claims rightward drags only
// (`activeOffsetX(REPLY_ACTIVATE)`, a positive threshold), and the thread-wide
// time reveal claims leftward ones only (`activeOffsetX(-14)` in each screen).
// A drag can only be one of the two, so neither has to block the other and the
// list's vertical scroll still wins outright via `failOffsetY`.
//
// 12 to start moving — far enough that a tap or a scroll never nudges the row.
const REPLY_ACTIVATE = 12;
// Past this on release, it replies. Also where the haptic fires, so your thumb
// is told the reply is armed before you let go, and you can drag back to cancel.
const REPLY_TRIGGER = 52;
// How much of a pull past the trigger still moves the row. Same asymptotic
// resistance as the time gutter, for the same reason: it should never stop dead.
const REPLY_RUBBER = 0.4;
// The arrow's box. Negative-margined to net zero, so it paints in the space to
// the left of the bubble without moving anything.
const REPLY_HINT_SIZE = 30;
const REPLY_SPRING = { damping: 20, stiffness: 260, mass: 0.5 };

export interface BubbleSender {
  id: string;
  name?: string | null;
  photoUrl?: string | null;
}

export interface MessageBubbleProps {
  content: string;
  type: 'text' | 'image';
  createdAt: string;
  isMine: boolean;
  // Optimistic state, straight off the model.
  status?: 'sending' | 'failed';
  sender?: BubbleSender;
  // Last message of a run — where the face goes.
  showAvatar?: boolean;
  // First of its run: everything else in the run tucks up against the message
  // above it, so a burst reads as one block rather than as separate messages
  // that happen to be adjacent.
  isFirstOfRun?: boolean;
  // How far the thread has been dragged left, 0…1. Every bubble shares one
  // value, so the whole column moves as a sheet and the times arrive together.
  revealX?: SharedValue<number>;
  // Whether this message is arriving *now*. A FlatList unmounts and remounts
  // rows as they leave and re-enter the window, and an entering animation
  // fires on every mount — so without this, scrolling back up replays the
  // arrival of messages you read minutes ago. The thread owns the answer
  // because only it knows what was already on screen.
  isNew?: boolean;
  // First message of a run in a group chat.
  showName?: boolean;
  // Omitted on messages that aren't yours; only your own carry ticks.
  tick?: TickStatus;
  mentionables?: Map<string, string>;
  // Tapbacks on this message, and whose they are.
  reactions?: MessageReaction[];
  myUserId?: string;
  // Long-pressed: hand the thread this bubble's rect so it can float the
  // tapback bar over it. Measured here because this is the only component that
  // knows where the bubble ended up.
  onOpenReactions?: (anchor: BubbleAnchor) => void;
  // Everyone whose "read up to" has passed this message. Only your own
  // messages ever carry them.
  readers?: Profile[];
  onReadersPress?: () => void;
  onRetry?: () => void;
  onLongPress?: () => void;
  onAvatarPress?: () => void;
  // The message this one quotes, as stored on the row (migration 072). Rendered
  // from the snapshot rather than looked up, so it is right even when the
  // original has been deleted or is older than the loaded page.
  reply?: { senderName: string; preview: string } | null;
  // Jump to the quoted message. Omitted when it is not in the loaded thread.
  onQuotePress?: () => void;
  // Swipe right to reply to this message. Omitted where a reply makes no sense
  // (a message that hasn't been sent yet), which is also what turns the gesture
  // off for that row.
  onReply?: () => void;
  // Whether the list this sits in is `inverted` — both threads are. The cell of
  // an inverted list carries a `scaleY: -1`, which silently flips the *direction*
  // of any vertical movement inside it: without this the send entrance arrives
  // from above instead of from behind the composer. Scales and opacities are
  // unaffected, which is what makes it easy to miss.
  inverted?: boolean;
}

export default function MessageBubble({
  content,
  type,
  createdAt,
  isMine,
  status,
  sender,
  showAvatar,
  isFirstOfRun,
  revealX,
  isNew,
  showName,
  tick,
  mentionables,
  reactions,
  myUserId,
  onOpenReactions,
  readers,
  onReadersPress,
  onRetry,
  onLongPress,
  onAvatarPress,
  reply,
  onQuotePress,
  onReply,
  inverted = false,
}: MessageBubbleProps) {
  const failed = status === 'failed';
  const sending = status === 'sending';

  // 1 = where the message came from, 0 = where it belongs. Seeded at mount so
  // the very first frame is already offset — the reason this is a shared value
  // and a `useAnimatedStyle` rather than Reanimated's `entering` prop, which
  // lays the view out at its resting place and applies its initial values a
  // frame later. Inside a FlatList cell that frame was reliably visible: the
  // bubble appeared where it was going, then dropped back to start its slide.
  const enter = useSharedValue(isNew ? 1 : 0);
  // 0 → 1 → 0: the give, which leads the travel and relaxes as it lands.
  const stretch = useSharedValue(0);

  useEffect(() => {
    if (!isNew) return;
    if (isMine) {
      enter.value = withSpring(0, GLIDE);
      stretch.value = withSequence(
        withTiming(1, {
          duration: STRETCH_IN_MS,
          easing: Easing.out(Easing.quad),
        }),
        withTiming(0, {
          duration: STRETCH_OUT_MS,
          easing: Easing.inOut(Easing.quad),
        })
      );
    } else {
      enter.value = withSpring(0, POP);
    }
  }, [isNew, isMine, enter, stretch]);

  // How far this one row has been pulled right, and whether the pull has passed
  // the point where letting go replies.
  const swipeX = useSharedValue(0);
  const armed = useSharedValue(0);

  // Built per render rather than memoised, the same way the thread's own reveal
  // pan is. A `useMemo` here earns nothing — GestureDetector diffs the config and
  // updates the native handler rather than rebuilding it — and it costs the
  // clarity of the worklets closing over the props directly.
  function fireReply() {
    onReply?.();
  }
  function armHaptic() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const replyPan = Gesture.Pan()
    // Rightward only — see REPLY_ACTIVATE. This is what keeps it out of the
    // thread's leftward time reveal.
    .activeOffsetX(REPLY_ACTIVATE)
    // And out of the list's scroll: the moment a drag looks vertical this gives
    // up, so scrolling never has to win a race.
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const raw = Math.max(0, e.translationX);
      const past = raw - REPLY_TRIGGER;
      swipeX.value =
        past <= 0
          ? raw
          : REPLY_TRIGGER + (past * REPLY_RUBBER) / (1 + past / REPLY_TRIGGER);

      // One tick as the reply arms, and it re-arms if you pull back — so
      // dragging out and back reads as "not this one" rather than as a buzzing
      // row.
      if (raw >= REPLY_TRIGGER && armed.value === 0) {
        armed.value = 1;
        runOnJS(armHaptic)();
      } else if (raw < REPLY_TRIGGER && armed.value === 1) {
        armed.value = 0;
      }
    })
    .onEnd((e) => {
      if (Math.max(0, e.translationX) >= REPLY_TRIGGER) runOnJS(fireReply)();
    })
    // onFinalize, not onEnd: a gesture cancelled by the list taking over still
    // has to put the row back.
    .onFinalize(() => {
      armed.value = 0;
      swipeX.value = withSpring(0, REPLY_SPRING);
    });

  // One style, not two. The reveal-drag, the reply swipe and the arrival all
  // want `transform`, and a later style in the array replaces the earlier one's
  // transform wholesale rather than merging — so they have to be composed here
  // or one of them silently wins.
  const rowStyle = useAnimatedStyle(() => {
    const dragX = (revealX ? revealX.value : 0) + swipeX.value;
    if (!isMine) {
      return {
        opacity: 1 - enter.value,
        transform: [
          { translateX: dragX },
          { scale: 1 - enter.value * POP_FROM },
        ],
      };
    }
    return {
      transform: [
        { translateX: dragX },
        // Negated in an inverted list so "from behind the composer" stays down
        // rather than up — see the `inverted` prop.
        { translateY: enter.value * SEND_FROM * (inverted ? -1 : 1) },
        { scaleY: 1 + stretch.value * STRETCH_Y },
        { scaleX: 1 - stretch.value * SQUASH_X },
      ],
    };
  });

  // The arrow fades and grows in as the row travels, and is at full size exactly
  // when the reply is armed — the visual half of the haptic.
  const hintStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, swipeX.value / REPLY_TRIGGER);
    return {
      opacity: progress,
      transform: [{ scale: 0.6 + progress * 0.4 }],
    };
  });

  const timeStyle = useAnimatedStyle(() =>
    revealX ? { opacity: Math.min(1, -revealX.value / TIME_GUTTER) } : {}
  );
  // The ref lives on a plain wrapping View, not on the PressableScale: its
  // host ref is not something to rely on, and `collapsable={false}` is what
  // stops Android's view flattening removing the wrapper — measureInWindow
  // never fires for a detached node. Same constraint as useOpenOverlay.
  const bubbleRef = useRef<View>(null);

  // measureInWindow, because the overlay that receives this is a Modal — it
  // has its own coordinate space and knows nothing about the list's scroll.
  // A missing ref falls through to no anchor rather than to a dead long-press.
  const openReactions = () => {
    if (!onOpenReactions) return;
    const node = bubbleRef.current;
    if (!node) return;
    node.measureInWindow((x, y, width, height) =>
      onOpenReactions({ x, y, width, height })
    );
  };

  const row = (
    <Animated.View
      style={[
        styles.row,
        styles.rowOrigin,
        isMine && styles.rowMine,
        isFirstOfRun ? styles.rowFirst : styles.rowTight,
        rowStyle,
      ]}
    >
      {!isMine &&
        (showAvatar ? (
          <Avatar
            name={sender?.name}
            photoUrl={sender?.photoUrl}
            size={AVATAR_SIZE}
            onPress={onAvatarPress}
          />
        ) : (
          <View style={styles.avatarSpacer} />
        ))}

      {/* The reply arrow, in the space the row vacates as it travels right.
          Net-zero width (see REPLY_HINT_SIZE) so adding it moves nothing, and
          `pointerEvents: none` so it never takes a touch from the bubble. */}
      {onReply ? (
        <Animated.View
          style={[styles.replyHint, hintStyle]}
          pointerEvents="none"
        >
          <Icon name="reply" size={17} color={COLORS.textMuted} />
        </Animated.View>
      ) : null}

      <View style={styles.column}>
        {showName && !isMine ? (
          <Text style={styles.senderName}>{sender?.name}</Text>
        ) : null}

        {type === 'image' ? (
          <PressableScale
            disabled={false}
            onPress={failed ? onRetry : undefined}
            onLongPress={onOpenReactions ? openReactions : onLongPress}
            delayLongPress={350}
            scaleTo={0.98}
          >
            {reply ? (
              <View style={styles.imageQuote}>
                <ReplyQuote
                  senderName={reply.senderName}
                  preview={reply.preview}
                  // Always the light treatment, even on your own photo: there is
                  // no ink bubble here for the dark variant to sit on.
                  isMine={false}
                  onPress={onQuotePress}
                />
              </View>
            ) : null}
            <ChatImageBubble uri={content} dimmed={sending} />
            {failed ? (
              <Text style={styles.imageStatus}>Not sent · tap to retry</Text>
            ) : isMine ? (
              <View style={styles.imageMetaRow}>
                <Text style={styles.imageStatus}>
                  {formatChatTime(createdAt)}
                </Text>
                {tick ? <Ticks status={tick} /> : null}
              </View>
            ) : null}
          </PressableScale>
        ) : (
          <View ref={bubbleRef} collapsable={false}>
            <PressableScale
              disabled={false}
              onPress={failed ? onRetry : undefined}
              onLongPress={onOpenReactions ? openReactions : onLongPress}
              delayLongPress={350}
              style={[
                styles.bubble,
                isMine && styles.bubbleMine,
                sending && styles.bubblePending,
              ]}
            >
              {reply ? (
                <ReplyQuote
                  senderName={reply.senderName}
                  preview={reply.preview}
                  isMine={isMine}
                  onPress={onQuotePress}
                />
              ) : null}
              <MentionText
                content={content}
                style={[styles.bubbleText, isMine && styles.bubbleTextMine]}
                mentionables={mentionables}
                light={isMine}
              />
            </PressableScale>
          </View>
        )}

        {failed ? (
          <View style={[styles.metaRow, isMine && styles.metaRowMine]}>
            <Text style={styles.failedText}>Not sent · tap to retry</Text>
          </View>
        ) : null}

        {reactions && reactions.length > 0 ? (
          <ReactionPills
            reactions={reactions}
            myUserId={myUserId}
            isMine={isMine}
            onPress={onOpenReactions ? openReactions : undefined}
          />
        ) : null}

        {readers && readers.length > 0 ? (
          <ReadRail
            readers={readers}
            alignRight={isMine}
            onPress={onReadersPress}
          />
        ) : null}
      </View>

      {/* The time lives in the gutter to the right, off-screen until the thread
          is dragged. Instagram's answer to a timestamp under every message: the
          when is available on demand instead of competing with the what.
          Absolutely positioned so revealing it costs no layout. */}
      <Animated.View style={[styles.gutter, timeStyle]} pointerEvents="none">
        <Text style={styles.gutterTime}>{formatChatTime(createdAt)}</Text>
        {tick && !failed ? <Ticks status={tick} /> : null}
      </Animated.View>
    </Animated.View>
  );

  // No detector at all when the row cannot be replied to, rather than a disabled
  // gesture: one fewer native handler per row, on the component a thread renders
  // fifty of.
  if (!onReply) return row;
  return <GestureDetector gesture={replyPan}>{row}</GestureDetector>;
}

const styles = themedStyles(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING[2],
  },
  rowMine: { justifyContent: 'flex-end' },
  // The send entrance stretches on Y. With the default centre origin that
  // stretch grows in *both* directions, so the row's top edge pushed up into
  // the message above it — which is the jump you see rather than a slide.
  // Anchored to the bottom, the give happens in the direction it is travelling
  // from.
  rowOrigin: { transformOrigin: 'bottom' },
  // Inside a burst, and between two. Both deliberately tiny — the separation
  // that matters is carried by the shape of the run, not by air. Raw numbers
  // rather than the spacing scale: at 2 and 4 these are hairlines between
  // adjacent shapes, not layout.
  rowFirst: { marginTop: 4 },
  rowTight: { marginTop: 2 },
  avatarSpacer: { width: AVATAR_SIZE },
  // Width + an equal negative left margin = no space taken, drawn in the gap to
  // the left of whatever follows it. A hint that changed the layout would nudge
  // every bubble in the thread the moment the gesture became available.
  replyHint: {
    width: REPLY_HINT_SIZE,
    marginLeft: -REPLY_HINT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  column: { maxWidth: '74%' },
  senderName: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.nano,
    color: inkAlpha(0.6),
    marginLeft: SPACING[3],
    marginBottom: SPACING[0.5],
  },
  bubble: {
    // Frosted rather than solid white — this thread now runs over the app's
    // drifting background. Not <Glass>: a bubble per message is a native blur
    // view per message, which is exactly the "blur inside a blur" cost
    // DESIGN.md §3 warns about, so it takes the fill and the hairline without
    // the blur pass.
    backgroundColor: COLORS.glassPanel,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: RADIUS['2xl'],
    borderBottomLeftRadius: 6,
    paddingHorizontal: SPACING[3.5],
    paddingVertical: SPACING[2.5],
    shadowColor: COLORS.ink,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  // Ink, not coral. The mockup's outgoing bubbles are the app black, and coral
  // is reserved for a screen's one real decision — a wall of it down the right
  // of every thread is the opposite of that.
  bubbleMine: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
    borderBottomLeftRadius: RADIUS['2xl'],
    borderBottomRightRadius: 6,
    shadowOpacity: 0.14,
  },
  bubblePending: { opacity: 0.6 },
  bubbleText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    lineHeight: 20,
    color: COLORS.textPrimary,
  },
  bubbleTextMine: { color: COLORS.white },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    alignSelf: 'flex-start',
    marginTop: SPACING[0.5],
    paddingHorizontal: SPACING[1.5],
  },
  metaRowMine: { alignSelf: 'flex-end' },
  failedText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.nano,
    color: COLORS.error,
  },
  gutter: {
    position: 'absolute',
    right: -TIME_GUTTER,
    bottom: 0,
    width: TIME_GUTTER,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: SPACING[1],
    paddingLeft: SPACING[2],
    height: 26,
  },
  gutterTime: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.nano,
    color: COLORS.textMuted,
  },
  // A quote above a photo has no bubble to sit inside, so it gets the inset the
  // bubble's padding would otherwise have given it.
  imageQuote: { paddingHorizontal: SPACING[1] },
  imageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    alignSelf: 'flex-end',
    marginTop: SPACING[1],
  },
  imageStatus: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.nano,
    color: inkAlpha(0.45),
    alignSelf: 'flex-end',
  },
}));
