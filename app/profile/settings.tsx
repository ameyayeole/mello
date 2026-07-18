import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { signOut, deleteAccount, updateProfile } from '@/services/auth.service';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import {
  Button,
  Icon,
  IconName,
  PressableScale,
  ScreenHeader,
  SectionLabel,
} from '@/components/ui';

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
                  } catch (e: any) {
                    Alert.alert('Error', e.message);
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
    <SafeAreaView style={styles.container}>
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
            variant="danger"
            height={46}
            onPress={handleSignOut}
            style={{ marginTop: 10 }}
          />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingTop: 14 },
  sectionLabel: { marginBottom: 8 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 18,
    shadowColor: '#0F182C',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,24,44,0.07)',
  },
  rowText: { flex: 1 },
  rowTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  rowSub: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
