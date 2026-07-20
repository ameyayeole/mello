import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { exchangeAuthCode } from '@/services/auth.service';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Button, CoralGlow, Icon, Loader, Screen } from '@/components/ui';

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
    <Screen background={COLORS.surface}>
      <CoralGlow size={320} style={styles.glow} />
      <View style={styles.center}>
        {phase === 'verifying' && (
          <>
            <Loader inline />
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
              variant="tertiary"
              label="Back to sign in"
              onPress={() => router.replace('/auth/login')}
              style={{ alignSelf: 'stretch', marginTop: 12 }}
            />
          </>
        )}
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
