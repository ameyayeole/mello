import { useState } from 'react';
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
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { sendPasswordReset } from '@/services/auth.service';
import { friendlyAuthError } from '@/utils/authErrors';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Button, Icon, CoralGlow } from '@/components/ui';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    try {
      setLoading(true);
      await sendPasswordReset(trimmed);
      setSent(true);
    } catch (e: any) {
      Alert.alert('Error', friendlyAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <CoralGlow size={320} style={styles.glow} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}
      >
        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={10}
            style={styles.backButton}
            accessibilityLabel="Back"
          >
            <Icon name="back" size={22} />
          </TouchableOpacity>
          <Text style={styles.title}>
            {sent ? 'Check your email' : 'Reset password'}
          </Text>
          <Text style={styles.subtitle}>
            {sent
              ? `We sent a reset link to\n${email.trim()}. Open it on this phone to set a new password.`
              : "Enter the email you signed up with and we'll send you a reset link."}
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(150).duration(500)}
          style={styles.form}
        >
          {sent ? (
            <>
              <Button
                label="Back to sign in"
                onPress={() => router.back()}
              />
              <TouchableOpacity onPress={handleSend} hitSlop={10} disabled={loading}>
                <Text style={styles.resendText}>
                  Didn't get it? <Text style={styles.resendLink}>Resend</Text>
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TextInput
                style={[styles.input, focused && styles.inputFocused]}
                placeholder="Email address"
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
                label="Send reset link"
                onPress={handleSend}
                loading={loading}
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
  container: { flex: 1, backgroundColor: COLORS.surface },
  glow: {
    position: 'absolute',
    top: -80,
    alignSelf: 'center',
  },
  inner: {
    flex: 1,
    padding: 24,
    paddingTop: 24,
    gap: 32,
  },
  header: { gap: 14 },
  backButton: { alignSelf: 'flex-start', marginBottom: 10 },
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
  resendText: {
    textAlign: 'center',
    fontFamily: FONTS.semibold,
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 6,
  },
  resendLink: { color: COLORS.primary, fontFamily: FONTS.bold },
});
