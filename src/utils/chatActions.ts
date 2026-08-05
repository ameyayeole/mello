import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { reportUser, ReportReason } from '@/services/moderation.service';
import type { ReplyTarget } from '@/types/models';
import { showError } from './errors';

// Actions the event chat and the DM screen perform identically. They used to
// hold verbatim copies of both, which is how the two drifted — the DM screen
// gained proper error handling on attachments and the event chat never did.

// ─── Opening a conversation ─────────────────────────────────────────────────
//
// **`withAnchor` is the whole point of these two, and it is not optional.**
//
// A plain `router.push('/(tabs)/chats/<id>')` mounts the chats stack with the
// thread as its *only* route. The anchor — `initialRouteName: 'index'`, the
// conversation list, declared in chats/_layout — is skipped by default: the
// `initial` param react-navigation sends with a nested navigation means "this
// incoming screen *is* the initial screen", and expo-router only flips it when
// you ask for the anchor. So there was no list under the thread to go back to,
// and back fell through to the tab navigator's own history instead: out to
// whichever tab you came from, back into the Inbox, which still had a thread
// loaded… which is how back walked through old chats one press at a time. The
// giveaway was `POP_TO_TOP was not handled by any navigator` — a stack of one.
//
// With the anchor the stack is [list, thread] from every entry point, so back is
// a plain single pop to the list, and it works the same for the header button,
// the iOS swipe and Android's back. Every "open chat" button in the app goes
// through here so that this cannot be forgotten at a new call site — and there
// are seventeen of them.

export function openEventChat(eventId: string) {
  router.push(`/(tabs)/chats/${eventId}`, { withAnchor: true });
}

export function openDmChat(friendId: string) {
  router.push(`/(tabs)/chats/dm/${friendId}`, { withAnchor: true });
}

const REPORT_REASONS: { label: string; reason: ReportReason }[] = [
  { label: 'Spam', reason: 'spam' },
  { label: 'Harassment', reason: 'harassment' },
  { label: 'Inappropriate content', reason: 'inappropriate' },
  { label: 'Other', reason: 'other' },
];

// Max characters of the message quoted into the report, so a moderator can find
// it without the report body carrying an entire wall of text.
const EXCERPT_LENGTH = 140;

export function messageExcerpt(message: {
  type: string;
  content: string;
}): string {
  return message.type === 'image'
    ? '[photo]'
    : message.content.slice(0, EXCERPT_LENGTH);
}

// How much of the quoted message is kept on a reply.
//
// Deliberately *more* than the three lines the quote block shows (see
// REPLY_QUOTE_LINES in ReplyQuote), and that is the point: the visible "…" has to
// be the Text's own tail truncation, which only appears when there is more text
// than fits. Cut this to the width of three lines and a long quote would end
// mid-sentence with no ellipsis at all — a message that looks like it stopped
// rather than one that looks continued.
//
// The cap is still here because this string is *stored on every reply*, and
// copying a wall of text onto each one is what it prevents. ~240 is three lines
// with a comfortable margin at any font scale.
const REPLY_PREVIEW_LENGTH = 240;

/**
 * The reply a stored row already carries, back in `ReplyTarget` shape. For
 * re-sending a failed reply: the row on screen holds the snapshot, so a retry
 * does not have to go looking for the original again.
 */
export function replyOf(message: {
  reply_to_id?: string | null;
  reply_preview?: string | null;
  reply_sender_name?: string | null;
}): ReplyTarget | null {
  if (!message.reply_to_id) return null;
  return {
    id: message.reply_to_id,
    preview: message.reply_preview ?? '',
    senderName: message.reply_sender_name ?? '',
  };
}

/**
 * The snapshot a reply carries: what to render in the quote block, and what to
 * write to `reply_preview` / `reply_sender_name`.
 *
 * Both threads go through this so an event chat and a DM truncate identically,
 * and so "you" is decided in one place — a quote of your own message reads
 * "You", the way it does everywhere else in the app.
 *
 * No ellipsis is added here. The quote block clamps to three lines and lets the
 * text engine truncate, so the "…" lands at the end of the third *rendered* line
 * whatever the width or the font scale — which is what a hand-appended one on a
 * character count cannot do.
 */
export function replyTargetOf(
  message: {
    id: string;
    type: string;
    content: string;
    sender_id: string;
    sender?: { name?: string | null } | null;
  },
  myUserId: string | undefined,
  // The DM screen knows the other person's name from the route, since a DM's
  // rows do not always carry a joined sender.
  fallbackName?: string | null
): ReplyTarget {
  return {
    id: message.id,
    // Not `messageExcerpt`: that caps at 140 for report bodies, which is about
    // three lines — so routing through it would cut exactly where the clamp
    // wants room to spare, and the ellipsis would come and go depending on how
    // the words happened to wrap.
    preview:
      message.type === 'image'
        ? '[photo]'
        : message.content.slice(0, REPLY_PREVIEW_LENGTH),
    senderName:
      message.sender_id === myUserId
        ? 'You'
        : (message.sender?.name ?? fallbackName ?? 'Them'),
  };
}

// Asks for a reason, files the report, confirms. `context` is the free-text
// trail moderators use to locate the message — the two screens phrase it
// differently because an event chat message needs its event named and a DM
// does not.
export function promptReportMessage(params: {
  reporterId: string;
  offenderId: string;
  context: string;
}): void {
  const file = (reason: ReportReason) =>
    reportUser(params.reporterId, params.offenderId, reason, params.context)
      .then(() =>
        Alert.alert('Report sent', 'Thanks — our team will review this.')
      )
      .catch((e: unknown) => showError(e));

  Alert.alert('Report message', 'Why are you reporting this?', [
    ...REPORT_REASONS.map(({ label, reason }) => ({
      text: label,
      onPress: () => file(reason),
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

// Returns the picked image's local URI, or null if the user backed out.
export async function pickChatImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.5,
  });
  return result.canceled ? null : (result.assets[0]?.uri ?? null);
}
