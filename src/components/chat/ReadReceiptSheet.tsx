import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Profile } from '@/types/models';
import { formatChatTime } from '@/utils/time';
import { Avatar, SectionLabel, Sheet } from '@/components/ui';

// Who has seen a message. Opened from the read rail under your own bubble.
//
// Two sections, and only two, because two is all the app actually knows:
// **Read** (a `chat_reads` watermark or a DM's `read_at` has passed this
// message) and **Sent** (everyone else in the conversation). There is no
// delivery receipt anywhere in the schema — nothing records a message arriving
// on a device — so a "Delivered" section here would be a guess dressed up as a
// fact. When push receipts exist it goes between the two.

export interface Reader {
  profile: Profile;
  // When their watermark passed this message. Absent for a DM, where the
  // receipt is a single flag rather than a time we can attribute per person.
  readAt?: string | null;
}

export default function ReadReceiptSheet({
  visible,
  readers,
  others,
  onClose,
}: {
  visible: boolean;
  readers: Reader[];
  // In the conversation, but not past this message yet.
  others: Profile[];
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} style={styles.card}>
      <Text style={styles.title}>Message info</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
      >
        {readers.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Read by</SectionLabel>
            {readers.map(({ profile, readAt }) => (
              <View key={profile.id} style={styles.row}>
                <Avatar name={profile.name} photoUrl={profile.photo_url} size={34} />
                <Text style={styles.name} numberOfLines={1}>
                  {profile.name}
                </Text>
                {readAt ? (
                  <Text style={styles.meta}>{formatChatTime(readAt)}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {others.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Sent to</SectionLabel>
            {others.map((profile) => (
              <View key={profile.id} style={styles.row}>
                <Avatar name={profile.name} photoUrl={profile.photo_url} size={34} />
                <Text style={styles.name} numberOfLines={1}>
                  {profile.name}
                </Text>
                <Text style={styles.meta}>Not read yet</Text>
              </View>
            ))}
          </View>
        ) : null}

        {readers.length === 0 && others.length === 0 ? (
          <Text style={styles.empty}>
            Nobody else is in this chat yet.
          </Text>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: SPACING[5], paddingTop: SPACING[4] },
  title: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.bodyLg,
    color: COLORS.textPrimary,
    marginBottom: SPACING[3],
  },
  // Capped so a 40-person event chat scrolls inside the sheet rather than
  // pushing it off the top of the screen.
  scroll: { maxHeight: 420 },
  scrollBody: { gap: SPACING[4], paddingBottom: SPACING[2] },
  section: { gap: SPACING[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3] },
  name: {
    flex: 1,
    minWidth: 0,
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  meta: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
  },
  empty: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
  },
});
