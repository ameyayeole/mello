import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { formatChatTime } from '@/utils/time';
import { Avatar, PressableScale } from '@/components/ui';
import ChatImageBubble from './ChatImageBubble';
import MentionText from './MentionText';
import Ticks, { TickStatus } from './Ticks';

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
  // First message of a run in a group chat.
  showName?: boolean;
  // Omitted on messages that aren't yours; only your own carry ticks.
  tick?: TickStatus;
  mentionables?: Map<string, string>;
  onRetry?: () => void;
  onLongPress?: () => void;
  onAvatarPress?: () => void;
}

export default function MessageBubble({
  content,
  type,
  createdAt,
  isMine,
  status,
  sender,
  showAvatar,
  showName,
  tick,
  mentionables,
  onRetry,
  onLongPress,
  onAvatarPress,
}: MessageBubbleProps) {
  const failed = status === 'failed';
  const sending = status === 'sending';

  return (
    <Animated.View
      entering={FadeInDown.duration(250)}
      style={[styles.row, isMine && styles.rowMine]}
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

      <View style={styles.column}>
        {showName && !isMine ? (
          <Text style={styles.senderName}>{sender?.name}</Text>
        ) : null}

        {type === 'image' ? (
          <PressableScale
            disabled={false}
            onPress={failed ? onRetry : undefined}
            onLongPress={onLongPress}
            delayLongPress={350}
            scaleTo={0.98}
          >
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
          <PressableScale
            disabled={false}
            onPress={failed ? onRetry : undefined}
            onLongPress={onLongPress}
            delayLongPress={350}
            style={[
              styles.bubble,
              isMine && styles.bubbleMine,
              sending && styles.bubblePending,
            ]}
          >
            <MentionText
              content={content}
              style={[styles.bubbleText, isMine && styles.bubbleTextMine]}
              mentionables={mentionables}
              light={isMine}
            />
            <View style={styles.metaRow}>
              <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
                {failed ? 'Not sent · tap to retry' : formatChatTime(createdAt)}
              </Text>
              {tick && !failed ? <Ticks status={tick} light={isMine} /> : null}
            </View>
          </PressableScale>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING[2],
  },
  rowMine: { justifyContent: 'flex-end' },
  avatarSpacer: { width: AVATAR_SIZE },
  column: { maxWidth: '74%' },
  senderName: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.nano,
    color: 'rgba(15,24,44,0.6)',
    marginLeft: SPACING[3],
    marginBottom: SPACING[0.5],
  },
  bubble: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderBottomLeftRadius: 4,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
    shadowColor: '#0F182C',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleMine: {
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
    shadowOpacity: 0,
  },
  bubblePending: { opacity: 0.6 },
  bubbleText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textPrimary,
  },
  bubbleTextMine: { color: '#fff' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    alignSelf: 'flex-end',
    marginTop: SPACING[0.5],
  },
  bubbleTime: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.nano,
    color: 'rgba(15,24,44,0.35)',
  },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.7)' },
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
    color: 'rgba(15,24,44,0.45)',
    alignSelf: 'flex-end',
  },
});
