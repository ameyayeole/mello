import { View,
  Text } from 'react-native';
import { Glass, Button, IconButton } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';
import { themedStyles } from '@/theme';

// Cold-start nudge for users with few friends / no posts. Dismissible; the
// parent screen decides when it recurs (see Task 7).
export function CommunityNudgeCard({
  onCompose,
  onFindFriends,
  onDismiss,
}: {
  onCompose: () => void;
  onFindFriends: () => void;
  onDismiss: () => void;
}) {
  return (
    <Glass tier="panel" radius={RADIUS['2xl']} style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Get your feed going</Text>
        <IconButton
          icon="close"
          variant="ghost"
          size={28}
          iconSize={16}
          onPress={onDismiss}
          accessibilityLabel="Dismiss"
        />
      </View>
      <Text style={styles.body}>
        Post something or add a few friends — your community fills up fast.
      </Text>
      <View style={styles.actions}>
        <Button variant="secondary" size="sm" label="Post" onPress={onCompose} />
        <Button
          variant="tertiary"
          size="sm"
          label="Find friends"
          onPress={onFindFriends}
        />
      </View>
    </Glass>
  );
}

const styles = themedStyles(() => ({
  card: { padding: SPACING[4], gap: SPACING[3] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.bodyLg, color: COLORS.textPrimary },
  body: { fontFamily: FONTS.medium, fontSize: TYPE_SIZE.body, color: COLORS.textSecondary },
  actions: { flexDirection: 'row', gap: SPACING[2] },
}));
