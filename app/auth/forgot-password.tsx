import { useState } from 'react';
import { SPACING } from '@/constants/spacing';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { sendPasswordReset } from '@/services/auth.service';
import { friendlyAuthError } from '@/utils/authErrors';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Button, Icon, CoralGlow, Screen, TextField } from '@/components/ui';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
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
    } catch (e) {
      Alert.alert('Error', friendlyAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen background={COLORS.surface} keyboardAvoiding>
      <CoralGlow size={320} style={styles.glow} />
      <View style={styles.inner}>
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
                variant="tertiary"
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
              <TextField
                placeholder="Email address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoFocus
              />
              <Button
                variant="primary"
                label="Send reset link"
                onPress={handleSend}
                loading={loading}
                disabled={!email}
                style={{ marginTop: SPACING[1] }}
              />
            </>
          )}
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: -80,
    alignSelf: 'center',
  },
  inner: {
    flex: 1,
    padding: SPACING[6],
    paddingTop: SPACING[6],
    gap: SPACING[8],
  },
  header: { gap: SPACING[3.5] },
  backButton: { alignSelf: 'flex-start', marginBottom: SPACING[2.5] },
  title: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.titleLg,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    lineHeight: 21,
    color: COLORS.textSecondary,
  },
  form: { gap: SPACING[3] },
  resendText: {
    textAlign: 'center',
    fontFamily: FONTS.semibold,
    color: COLORS.textSecondary,
    fontSize: TYPE_SIZE.bodyMd,
    marginTop: SPACING[1.5],
  },
  resendLink: { color: COLORS.primary, fontFamily: FONTS.bold },
});
