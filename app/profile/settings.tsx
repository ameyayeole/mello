import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { RADIUS, SPACING } from '@/constants/spacing';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { signOut, deleteAccount, updateProfile } from '@/services/auth.service';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import {
  Button,
  Icon,
  IconName,
  PressableScale,
  Screen,
  ScreenHeader,
  SectionLabel,
} from '@/components/ui';
import { showError } from '@/utils/errors';

function SettingsRow({
  icon,
  iconColor = COLORS.textPrimary,
  title,
  subtitle,
  onPress,
  trailing,
  last = false,
}: {
  icon: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <PressableScale
      scaleTo={onPress ? 0.98 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.row, !last && styles.rowBorder]}
    >
      <Icon name={icon} size={20} color={iconColor} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {trailing ??
        (onPress ? (
          <Icon name="chevronRight" size={18} color="rgba(15,24,44,0.35)" />
        ) : null)}
    </PressableScale>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const email = useAuthStore((s) => s.session?.user?.email);
  const clear = useAuthStore((s) => s.clear);
  const { ghostMode, setGhostMode } = useUIStore();

  async function toggleGhostMode(value: boolean) {
    setGhostMode(value);
    if (user) {
      await updateProfile(user.id, { is_ghost_mode: value });
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your profile, events, chats and photos. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            // A second confirm — deletion is irreversible, one mis-tap
            // shouldn't be enough.
            Alert.alert('Are you absolutely sure?', 'There is no way back.', [
              { text: 'Keep my account', style: 'cancel' },
              {
                text: 'Delete forever',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteAccount();
                    clear();
                    router.replace('/onboarding/welcome');
                  } catch (e) {
                    showError(e);
                  }
                },
              },
            ]),
        },
      ]
    );
  }

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          clear();
          router.replace('/onboarding/welcome');
        },
      },
    ]);
  }

  return (
    <Screen modal>
      <ScreenHeader title="Settings" />

      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View entering={FadeInDown.duration(350)}>
          <SectionLabel style={styles.sectionLabel}>Account</SectionLabel>
          <View style={styles.card}>
            <SettingsRow
              icon="user"
              title="Edit profile"
              onPress={() => router.push('/profile/edit')}
            />
            <SettingsRow
              icon="lock"
              title="Change password"
              onPress={() => router.push('/profile/change-password')}
            />
            <SettingsRow
              icon="send"
              title="Change email"
              subtitle={email}
              onPress={() => router.push('/profile/change-email')}
              last
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(70).duration(350)}>
          <SectionLabel style={styles.sectionLabel}>
            Privacy & safety
          </SectionLabel>
          <View style={styles.card}>
            <SettingsRow
              icon="lock"
              iconColor={COLORS.verified}
              title="Ghost mode"
              subtitle="Hide your online presence from others"
              trailing={
                <Switch
                  value={ghostMode}
                  onValueChange={toggleGhostMode}
                  trackColor={{ true: COLORS.primary, false: COLORS.disabled }}
                  thumbColor={COLORS.surface}
                />
              }
            />
            <SettingsRow
              icon="block"
              iconColor={COLORS.error}
              title="Blocked users"
              subtitle="Review and unblock people"
              onPress={() => router.push('/profile/blocked')}
            />
            <SettingsRow
              icon="shield"
              iconColor={COLORS.verified}
              title="Verify your identity"
              subtitle={
                user?.kyc_status === 'approved'
                  ? 'Verified — badge active'
                  : user?.kyc_status === 'pending_review'
                    ? 'Under review'
                    : 'Get the verified badge'
              }
              onPress={() => router.push('/profile/verify')}
              last
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(140).duration(350)}>
          <SectionLabel style={styles.sectionLabel}>Danger zone</SectionLabel>
          <View style={styles.card}>
            <SettingsRow
              icon="trash"
              iconColor={COLORS.error}
              title="Delete account"
              subtitle="Permanently erase your account and data"
              onPress={handleDeleteAccount}
              last
            />
          </View>
          <Button
            label="Log out"
            variant="tertiary"
            height={46}
            onPress={handleSignOut}
            style={{ marginTop: SPACING[2.5] }}
          />
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: SPACING[5], paddingTop: SPACING[3.5] },
  sectionLabel: { marginBottom: SPACING[2] },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    marginBottom: SPACING[4],
    shadowColor: '#0F182C',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingHorizontal: SPACING[3.5],
    paddingVertical: SPACING[3.5],
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,24,44,0.07)',
  },
  rowText: { flex: 1 },
  rowTitle: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  rowSub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
});
