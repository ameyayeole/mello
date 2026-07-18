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
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  signInWithApple,
  appleSignInAvailable,
  AppleSignInCancelled,
  resendSignupEmail,
} from '@/services/auth.service';
import { friendlyAuthError } from '@/utils/authErrors';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Button, Icon, MelloWordmark, CoralGlow } from '@/components/ui';

type Mode = 'signin' | 'signup';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const MIN_PASSWORD_LENGTH = 8;

export default function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);
  const [loading, setLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  // Set when signup (or an unverified sign-in) is waiting on the email
  // confirmation link — swaps the form for a "check your inbox" state.
  const [confirmEmailSentTo, setConfirmEmailSentTo] = useState<string | null>(
    null
  );

  useEffect(() => {
    appleSignInAvailable().then(setAppleAvailable);
  }, []);

  async function handleGoogle() {
    try {
      setLoading(true);
      await signInWithGoogle();
    } catch (e: any) {
      Alert.alert('Error', friendlyAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleApple() {
    try {
      setLoading(true);
      await signInWithApple();
    } catch (e: any) {
      if (!(e instanceof AppleSignInCancelled)) {
        Alert.alert('Error', friendlyAuthError(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResendConfirmation(to: string) {
    try {
      await resendSignupEmail(to);
      Alert.alert('Sent', `We sent a new confirmation link to ${to}.`);
    } catch (e: any) {
      Alert.alert('Error', friendlyAuthError(e));
    }
  }

  async function handleEmail() {
    if (!email || !password) return;
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (mode === 'signup' && password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert(
        'Password too short',
        `Use at least ${MIN_PASSWORD_LENGTH} characters.`
      );
      return;
    }
    try {
      setLoading(true);
      if (mode === 'signin') {
        await signInWithEmail(trimmed, password);
      } else {
        const { needsConfirmation } = await signUpWithEmail(trimmed, password);
        if (needsConfirmation) setConfirmEmailSentTo(trimmed);
      }
    } catch (e: any) {
      const msg = String(e?.message ?? '').toLowerCase();
      if (msg.includes('email not confirmed')) {
        Alert.alert(
          'Email not verified',
          'Check your inbox for the confirmation link, or resend it.',
          [
            { text: 'OK', style: 'cancel' },
            { text: 'Resend', onPress: () => handleResendConfirmation(trimmed) },
          ]
        );
      } else {
        Alert.alert('Error', friendlyAuthError(e));
      }
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
          <MelloWordmark size={46} />
          <Text style={styles.tagline}>Drop a pin.{'\n'}Find your people.</Text>
        </Animated.View>

        {confirmEmailSentTo ? (
          <Animated.View
            entering={FadeInUp.duration(400)}
            style={styles.form}
          >
            <Text style={styles.confirmTitle}>Check your email</Text>
            <Text style={styles.confirmBody}>
              We sent a confirmation link to{'\n'}
              <Text style={{ fontFamily: FONTS.bold }}>
                {confirmEmailSentTo}
              </Text>
              .{'\n'}Open it on this phone to activate your account.
            </Text>
            <Button
              label="Resend link"
              onPress={() => handleResendConfirmation(confirmEmailSentTo)}
            />
            <TouchableOpacity
              onPress={() => {
                setConfirmEmailSentTo(null);
                setMode('signin');
              }}
              hitSlop={10}
            >
              <Text style={styles.toggleText}>
                <Text style={styles.toggleLink}>Back to sign in</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
        <Animated.View
          entering={FadeInUp.delay(150).duration(500)}
          style={styles.form}
        >
          {appleAvailable && (
            <Button
              label="Continue with Apple"
              onPress={handleApple}
              disabled={loading}
              style={styles.appleButton}
            />
          )}
          <Button
            label="Continue with Google"
            onPress={handleGoogle}
            disabled={loading}
          />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or use email</Text>
            <View style={styles.dividerLine} />
          </View>

          <TextInput
            style={[styles.input, focused === 'email' && styles.inputFocused]}
            placeholder="Email address"
            placeholderTextColor="rgba(15,24,44,0.40)"
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocused('email')}
            onBlur={() => setFocused(null)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <View
            style={[
              styles.passwordRow,
              focused === 'password' && styles.inputFocused,
            ]}
          >
            <TextInput
              style={styles.passwordInput}
              placeholder="Password"
              placeholderTextColor="rgba(15,24,44,0.40)"
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
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

          {mode === 'signin' && (
            <TouchableOpacity
              onPress={() => router.push('/auth/forgot-password')}
              hitSlop={10}
              style={styles.forgotWrap}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          <Button
            label={mode === 'signin' ? 'Sign in' : 'Create account'}
            onPress={handleEmail}
            loading={loading}
            disabled={!email || !password}
            style={{ marginTop: 4 }}
          />

          <TouchableOpacity
            onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            hitSlop={10}
          >
            <Text style={styles.toggleText}>
              {mode === 'signin' ? (
                <>
                  New here? <Text style={styles.toggleLink}>Sign up</Text>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <Text style={styles.toggleLink}>Sign in</Text>
                </>
              )}
            </Text>
          </TouchableOpacity>

          <Text style={styles.terms}>
            By continuing you agree to our Terms{'\n'}and Community Safety
            guidelines.
          </Text>
        </Animated.View>
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
    justifyContent: 'space-between',
    paddingTop: 100,
    paddingBottom: 24,
  },
  header: { alignItems: 'center', gap: 18 },
  tagline: {
    fontFamily: FONTS.semibold,
    fontSize: 16,
    lineHeight: 23,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  form: { gap: 13 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 2,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: {
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: COLORS.textMuted,
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
  forgotWrap: { alignSelf: 'flex-end', marginTop: -4 },
  // Apple's HIG wants their button visually distinct — solid black.
  appleButton: { backgroundColor: '#000', shadowColor: '#000' },
  confirmTitle: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  confirmBody: {
    fontFamily: FONTS.medium,
    fontSize: 14.5,
    lineHeight: 21,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 6,
  },
  forgotText: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: COLORS.primary,
  },
  toggleText: {
    textAlign: 'center',
    fontFamily: FONTS.semibold,
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 6,
  },
  toggleLink: { color: COLORS.primary, fontFamily: FONTS.bold },
  terms: {
    textAlign: 'center',
    fontFamily: FONTS.medium,
    fontSize: 11,
    lineHeight: 16,
    color: 'rgba(15,24,44,0.4)',
    marginTop: 10,
  },
});
