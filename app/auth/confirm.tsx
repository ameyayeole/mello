import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { exchangeAuthCode } from '@/services/auth.service';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Button, Icon, CoralGlow } from '@/components/ui';

type Phase = 'verifying' | 'done' | 'invalid';

// Landing for Supabase confirmation emails (signup verify + email change):
// mello://auth/confirm?code=… . Exchanging the code signs the user in, after
// which the AuthGuard routes them onward (profile-setup or map) — this screen
// only needs to cover the in-between and the failure case.
export default function ConfirmScreen() {
  const router = useRouter();
  const { code, error_description } = useLocalSearchParams<{
    code?: string;
    error_description?: string;
  }>();
  const [phase, setPhase] = useState<Phase>(code ? 'verifying' : 'invalid');

  useEffect(() => {
    if (!code) return;
    exchangeAuthCode(code)
      .then(() => setPhase('done'))
      .catch(() => setPhase('invalid'));
  }, [code]);

  return (
    <SafeAreaView style={styles.container}>
      <CoralGlow size={320} style={styles.glow} />
      <View style={styles.center}>
        {phase === 'verifying' && (
          <>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.subtitle}>Confirming your email…</Text>
          </>
        )}
        {phase === 'done' && (
          <>
            <Icon name="check" size={40} color={COLORS.primary} />
            <Text style={styles.title}>Email confirmed</Text>
            <Text style={styles.subtitle}>Taking you into Mello…</Text>
          </>
        )}
        {phase === 'invalid' && (
          <>
            <Text style={styles.title}>Link expired</Text>
            <Text style={[styles.subtitle, { textAlign: 'center' }]}>
              {error_description ||
                'This confirmation link is invalid or has expired. Sign in to request a new one — and open it on this phone.'}
            </Text>
            <Button
              label="Back to sign in"
              onPress={() => router.replace('/auth/login')}
              style={{ alignSelf: 'stretch', marginTop: 12 }}
            />
          </>
        )}
      </View>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
    paddingBottom: 80,
  },
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
});
