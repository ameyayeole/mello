import { useState } from 'react';
import {
  Text,
  StyleSheet,
  TextInput,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { changeEmail } from '@/services/auth.service';
import { friendlyAuthError } from '@/utils/authErrors';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Button, ScreenHeader } from '@/components/ui';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function ChangeEmailScreen() {
  const router = useRouter();
  const currentEmail = useAuthStore((s) => s.session?.user?.email);
  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);
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
    } catch (e: any) {
      Alert.alert('Error', friendlyAuthError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Change email" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}
      >
        <Animated.View entering={FadeInDown.duration(350)} style={styles.form}>
          {sentTo ? (
            <>
              <Text style={styles.hint}>
                We sent a confirmation link to{' '}
                <Text style={{ fontFamily: FONTS.bold }}>{sentTo}</Text>. Your
                email changes once you open it on this phone. Until then you
                keep signing in with {currentEmail}.
              </Text>
              <Button label="Done" onPress={() => router.back()} />
            </>
          ) : (
            <>
              <Text style={styles.hint}>
                You currently sign in as{' '}
                <Text style={{ fontFamily: FONTS.bold }}>
                  {currentEmail ?? 'your email'}
                </Text>
                . We&apos;ll send a confirmation link to the new address —
                nothing changes until you open it.
              </Text>
              <TextInput
                style={[styles.input, focused && styles.inputFocused]}
                placeholder="New email address"
                placeholderTextColor="rgba(15,24,44,0.40)"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoFocus
              />
              <Button
                label="Send confirmation link"
                onPress={handleSave}
                loading={saving}
                disabled={!email}
                style={{ marginTop: 4 }}
              />
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, padding: 20, paddingTop: 10 },
  form: { gap: 13 },
  hint: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
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
});
