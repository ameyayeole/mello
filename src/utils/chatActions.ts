import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { reportUser, ReportReason } from '@/services/moderation.service';
import { showError } from './errors';

// Actions the event chat and the DM screen perform identically. They used to
// hold verbatim copies of both, which is how the two drifted — the DM screen
// gained proper error handling on attachments and the event chat never did.

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
