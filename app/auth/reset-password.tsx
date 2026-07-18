import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { exchangeAuthCode, updatePassword } from '@/services/auth.service';
import { friendlyAuthError } from '@/utils/authErrors';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Button, Icon, CoralGlow } from '@/components/ui';

const MIN_PASSWORD_LENGTH = 8;

type Phase = 'verifying' | 'ready' | 'invalid';

// Landed on via the reset email's deep link: mello://auth/reset-password?code=…
// The PKCE code only exchanges on the device that requested the reset, so the
// email must be opened on this phone — 'invalid' covers expired links and
// links opened elsewhere.
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { code, error_description } = useLocalSearchParams<{
    code?: string;
    error_description?: string;
  }>();
  const session = useAuthStore((s) => s.session);

  const [phase, setPhase] = useState<Phase>(code ? 'verifying' : 'invalid');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<'password' | 'confirm' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!code) {
      // No code in the link, but a recovery session may already be set
      // (e.g. the auth listener processed the link before we mounted).
      if (session) setPhase('ready');
      return;
    }
    exchangeAuthCode(code)
      .then(() => setPhase('ready'))
      .catch(() => setPhase('invalid'));
  }, [code]);

  async function handleSave() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert(
        'Password too short',
        `Use at least ${MIN_PASSWORD_LENGTH} characters.`
      );
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords don’t match', 'Please re-enter them.');
      return;
    }
    try {
      setSaving(true);
      await updatePassword(password);
      Alert.alert('Password updated', 'You’re signed in with your new password.');
      router.replace('/(tabs)/map');
    } catch (e: any) {
      Alert.alert('Error', friendlyAuthError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <CoralGlow size={320} style={styles.glow} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}
      >
        {phase === 'verifying' && (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.subtitle}>Verifying your reset link…</Text>
          </View>
        )}

        {phase === 'invalid' && (
          <View style={styles.center}>
            <Text style={styles.title}>Link expired</Text>
            <Text style={[styles.subtitle, { textAlign: 'center' }]}>
              {error_description ||
                'This reset link is invalid or has expired. Request a new one — and make sure you open it on this phone.'}
            </Text>
            <Button
              label="Request a new link"
              onPress={() => router.replace('/auth/forgot-password')}
              style={{ alignSelf: 'stretch', marginTop: 12 }}
            />
          </View>
        )}

        {phase === 'ready' && (
          <>
            <Animated.View
              entering={FadeInDown.duration(500)}
              style={styles.header}
            >
              <Text style={styles.title}>Set a new password</Text>
              <Text style={styles.subtitle}>
                Use at least {MIN_PASSWORD_LENGTH} characters. You&apos;ll be
                signed in right after.
              </Text>
            </Animated.View>

            <Animated.View
              entering={FadeInUp.delay(150).duration(500)}
              style={styles.form}
            >
              <View
                style={[
                  styles.passwordRow,
                  focused === 'password' && styles.inputFocused,
                ]}
              >
                <TextInput
                  style={styles.passwordInput}
                  placeholder="New password"
                  placeholderTextColor="rgba(15,24,44,0.40)"
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoFocus
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={10}
                  accessibilityLabel={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                >
                  <Icon
                    name={showPassword ? 'eyeOff' : 'eye'}
                    size={20}
                    color={COLORS.textMuted}
                  />
                </TouchableOpacity>
              </View>

              <TextInput
                style={[
                  styles.input,
                  focused === 'confirm' && styles.inputFocused,
                ]}
                placeholder="Confirm new password"
                placeholderTextColor="rgba(15,24,44,0.40)"
                value={confirm}
                onChangeText={setConfirm}
                onFocus={() => setFocused('confirm')}
                onBlur={() => setFocused(null)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />

              <Button
                label="Update password"
                onPress={handleSave}
                loading={saving}
                disabled={!password || !confirm}
                style={{ marginTop: 4 }}
              />
            </Animated.View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  glow: {
    position: 'absolute',
    top: -80,
    alignSelf: 'center',
  },
  inner: {
    flex: 1,
    padding: 24,
    paddingTop: 48,
    gap: 32,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingBottom: 80,
  },
  header: { gap: 14 },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 26,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: 14.5,
    lineHeight: 21,
    color: COLORS.textSecondary,
  },
  form: { gap: 13 },
  input: {
    height: 48,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputFocused: { borderWidth: 1.5, borderColor: COLORS.primary },
  passwordRow: {
    height: 48,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
});
