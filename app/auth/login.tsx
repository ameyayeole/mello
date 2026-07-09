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
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '@/services/auth.service';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Button, MelloWordmark, CoralGlow } from '@/components/ui';

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    try {
      setLoading(true);
      await signInWithGoogle();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleEmail() {
    if (!email || !password) return;
    try {
      setLoading(true);
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
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

        <Animated.View
          entering={FadeInUp.delay(150).duration(500)}
          style={styles.form}
        >
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
          <TextInput
            style={[styles.input, focused === 'password' && styles.inputFocused]}
            placeholder="Password"
            placeholderTextColor="rgba(15,24,44,0.40)"
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocused('password')}
            onBlur={() => setFocused(null)}
            secureTextEntry
          />

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
