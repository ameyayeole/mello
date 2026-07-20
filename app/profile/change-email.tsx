import { useState } from 'react';
import { SPACING } from '@/constants/spacing';
import { Text, StyleSheet, Alert } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { changeEmail } from '@/services/auth.service';
import { friendlyAuthError } from '@/utils/authErrors';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Button, Screen, ScreenHeader, TextField } from '@/components/ui';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function ChangeEmailScreen() {
  const router = useRouter();
  const currentEmail = useAuthStore((s) => s.session?.user?.email);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (trimmed.toLowerCase() === currentEmail?.toLowerCase()) {
      Alert.alert('Same email', 'That is already your email address.');
      return;
    }
    try {
      setSaving(true);
      await changeEmail(trimmed);
      setSentTo(trimmed);
    } catch (e) {
      Alert.alert('Error', friendlyAuthError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen modal keyboardAvoiding>
      <ScreenHeader title="Change email" />
      <Animated.View entering={FadeInDown.duration(350)} style={styles.form}>
        {sentTo ? (
          <>
            <Text style={styles.hint}>
              We sent a confirmation link to{' '}
              <Text style={{ fontFamily: FONTS.bold }}>{sentTo}</Text>. Your
              email changes once you open it on this phone. Until then you keep
              signing in with {currentEmail}.
            </Text>
            <Button
  variant="tertiary" label="Done" onPress={() => router.back()} />
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              You currently sign in as{' '}
              <Text style={{ fontFamily: FONTS.bold }}>
                {currentEmail ?? 'your email'}
              </Text>
              . We&apos;ll send a confirmation link to the new address — nothing
              changes until you open it.
            </Text>
            <TextField
              placeholder="New email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoFocus
            />
            <Button
              variant="primary"
              label="Send confirmation link"
              onPress={handleSave}
              loading={saving}
              disabled={!email}
              style={{ marginTop: SPACING[1] }}
            />
          </>
        )}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: SPACING[3], padding: SPACING[5], paddingTop: SPACING[2.5] },
  hint: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textSecondary,
    marginBottom: SPACING[1],
  },
});
