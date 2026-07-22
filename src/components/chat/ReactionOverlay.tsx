import { useWindowDimensions, Modal, Pressable, View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import ReactionBar from './ReactionBar';
import { barEnter, liftEnter } from './motion';

// iMessage's tapback: the thread dims, the message you pressed stays lit where
// it already was, and the emoji float beside it.
//
// The first version put the bar *inline*, above the bubble in the list. That
// pushed every message below it down the screen — the thread jumped under your
// thumb at the exact moment you were aiming at something — and on the last
// message the bar opened off the bottom of the scroll. An overlay leaves the
// list alone entirely.
//
// The bubble here is a **copy**, drawn at the original's measured rect. The
// real one stays in the list underneath the scrim; nothing is moved or
// re-parented, so dismissing cannot leave the thread in a different state than
// it started.

/** Where the pressed bubble sits, in window coordinates. */
export interface BubbleAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The bar's own height plus the air it keeps off the bubble. Used to decide
// whether it fits above.
const BAR_HEIGHT = 52;
const GAP = SPACING[2];

// Never let the copy sit under the status bar or the home indicator when a
// message is taller than the space it has.
const EDGE = SPACING[10];

export default function ReactionOverlay({
  visible,
  anchor,
  content,
  isMine,
  myEmoji,
  onPick,
  onMore,
  onClose,
}: {
  visible: boolean;
  anchor: BubbleAnchor | null;
  content: string;
  isMine: boolean;
  myEmoji?: string;
  onPick: (emoji: string) => void;
  onMore?: () => void;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  if (!anchor) return null;

  // Above the bubble by default. A message near the top of the screen has no
  // room there, so the bar flips underneath it instead — the same rule
  // iMessage uses, and the reason a reply to the oldest message on screen
  // doesn't open a bar you cannot see.
  const fitsAbove = anchor.y - BAR_HEIGHT - GAP > EDGE;
  const barTop = fitsAbove
    ? anchor.y - BAR_HEIGHT - GAP
    : Math.min(anchor.y + anchor.height + GAP, height - BAR_HEIGHT - EDGE);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* One press target over everything: anywhere off the bar puts it away,
          including on the bubble itself. */}
      <Pressable style={styles.fill} onPress={onClose}>
        {/* Blurred rather than merely darkened. The thread stays legible
            behind the message you lifted — you can still see the conversation
            you are reacting inside of — which a flat 45% scrim destroys.
            Full-screen and square, so none of the corner-clipping that bit the
            small discs applies. */}
        <Animated.View
          entering={FadeIn.duration(140)}
          style={StyleSheet.absoluteFill}
        >
          <BlurView
            intensity={18}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        </Animated.View>

        {/* Lifts from 94%, not from nothing: this is the message you are
            already looking at, raised. A preset ZoomIn scales from zero, which
            reads as a notification appearing over the thread. */}
        <Animated.View
          entering={liftEnter}
          style={[
            styles.copy,
            // The measured rect, straight through: the copy lands exactly on
            // the original rather than being re-derived from which side of the
            // thread it is on.
            { top: anchor.y, left: anchor.x, width: anchor.width },
          ]}
          pointerEvents="none"
        >
          <View style={[styles.bubble, isMine && styles.bubbleMine]}>
            <Text
              style={[styles.bubbleText, isMine && styles.bubbleTextMine]}
            >
              {content}
            </Text>
          </View>
        </Animated.View>

        <Animated.View
          entering={barEnter}
          style={[styles.barSlot, { top: barTop }]}
          pointerEvents="box-none"
        >
          <ReactionBar
            mine={myEmoji}
            alignRight={isMine}
            onPick={onPick}
            onMore={onMore}
          />
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Light, because the blur is doing most of the work. `inkVeil` is the token
  // for exactly this — keeping contrast without killing what is behind.
  scrim: { backgroundColor: COLORS.inkVeil },
  copy: { position: 'absolute' },
  bubble: {
    backgroundColor: COLORS.glassPanel,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: RADIUS['2xl'],
    borderBottomLeftRadius: 6,
    paddingHorizontal: SPACING[3.5],
    paddingVertical: SPACING[2.5],
  },
  bubbleMine: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
    borderBottomLeftRadius: RADIUS['2xl'],
    borderBottomRightRadius: 6,
  },
  bubbleText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    lineHeight: 20,
    color: COLORS.textPrimary,
  },
  bubbleTextMine: { color: COLORS.white },
  // Full width so the bar can hug either edge, matching the bubble it belongs
  // to.
  barSlot: {
    position: 'absolute',
    left: SPACING[4],
    right: SPACING[4],
  },
});
