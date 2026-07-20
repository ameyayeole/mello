import { useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '@/stores/authStore';
import { startKycVerification, pollKycStatus } from '@/services/kyc.service';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Button, Icon, Screen, ScreenHeader, VerifiedBadge } from '@/components/ui';

const STATUS_COPY: Record<
  string,
  { title: string; body: string; cta: string | null }
> = {
  none: {
    title: 'Get your verified badge',
    body: 'Confirm you’re a real person. Verified profiles get a badge and build trust across Mello.',
    cta: 'Verify my identity',
  },
  in_progress: {
    title: 'Verification in progress',
    body: 'You started verifying but didn’t finish. Pick up where you left off — it only takes a couple of minutes.',
    cta: 'Continue verification',
  },
  pending_review: {
    title: 'Under review',
    body: 'Your documents are being reviewed. This usually takes a few minutes — we’ll update your badge automatically.',
    cta: null,
  },
  approved: {
    title: 'You’re verified',
    body: 'Your identity has been confirmed. The verified badge now shows on your profile.',
    cta: null,
  },
  declined: {
    title: 'Verification unsuccessful',
    body: 'We couldn’t confirm your identity from the documents provided. Check that your photos are clear and try again.',
    cta: 'Try again',
  },
  expired: {
    title: 'Verification expired',
    body: 'Your previous verification has expired. Verify again to restore your badge.',
    cta: 'Verify again',
  },
};

export default function VerifyIdentityScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const status = user?.kyc_status ?? 'none';
  const copy = STATUS_COPY[status] ?? STATUS_COPY.none;

  async function handleVerify() {
    if (!user) return;
    setBusy(true);
    try {
      await startKycVerification();
      // The webhook decides — poll briefly so the screen reflects the result.
      setWaiting(true);
      const latest = await pollKycStatus(user.id);
      if (latest) setUser(latest);
    } catch (e) {
      Alert.alert(
        'Verification',
        e instanceof Error ? e.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setBusy(false);
      setWaiting(false);
    }
  }

  return (
    <Screen modal>
      <ScreenHeader title="Identity verification" />

      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View entering={FadeInDown.duration(350)} style={styles.hero}>
          {status === 'approved' ? (
            <VerifiedBadge size={64} />
          ) : (
            <View style={styles.heroIcon}>
              <Icon name="shield" size={34} color={COLORS.verified} />
            </View>
          )}
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
        </Animated.View>

        {copy.cta ? (
          <Animated.View entering={FadeInDown.delay(70).duration(350)}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>How it works</Text>
              <Text style={styles.cardBody}>
                You’ll photograph a government ID — Aadhaar, PAN, driving
                licence, passport or voter ID — and take a short selfie to
                match it.
              </Text>
              <Text style={styles.cardBody}>
                Verification is processed securely by Didit, our identity
                partner. Mello never sees or stores your documents — only the
                result (verified or not).
              </Text>
            </View>

            <Button
              variant="primary"
              label={waiting ? 'Checking result…' : copy.cta}
              onPress={handleVerify}
              loading={busy}
              style={{ marginTop: SPACING[4] }}
            />
            <Text style={styles.consent}>
              By continuing you agree to share your ID document and selfie with
              Didit for identity verification.
            </Text>
          </Animated.View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: SPACING[5], paddingTop: SPACING[6] },
  hero: { alignItems: 'center', marginBottom: SPACING[6] },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(42,111,219,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.title,
    color: COLORS.textPrimary,
    marginTop: SPACING[3.5],
    textAlign: 'center',
  },
  body: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    lineHeight: 20,
    color: COLORS.textSecondary,
    marginTop: SPACING[2],
    textAlign: 'center',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING[4],
    gap: SPACING[2.5],
    shadowColor: '#0F182C',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  cardBody: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },
  consent: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    lineHeight: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING[3],
    paddingHorizontal: SPACING[2.5],
  },
});
