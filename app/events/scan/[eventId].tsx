import { useEffect, useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { getEventDetail } from '@/services/events.service';
import {
  checkInWithCode,
  checkInWithToken,
  decodeQrFromJpeg,
  getMyCheckinTime,
  isLiveScannerAvailable,
  parseCheckinPayload,
} from '@/services/checkin.service';
import { CheckinResult } from '@/types/models';
import { hasWrapped } from '@/services/wrap.service';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { formatEventTime } from '@/utils/time';
import {
  Button,
  CategoryTile,
  Icon,
  Loader,
  PressableScale,
  Screen,
  ScreenHeader,
} from '@/components/ui';
import type LiveScannerType from '@/components/events/LiveScanner';

type Feedback = { tone: 'error' | 'warn'; text: string };

export default function AttendeeScanScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [Scanner, setScanner] = useState<typeof LiveScannerType | null>(null);
  const [liveAvailable, setLiveAvailable] = useState(false);

  const { data: event, isLoading } = useQuery({
    queryKey: queryKeys.eventDetail.of(eventId),
    queryFn: () => getEventDetail(eventId),
    enabled: !!eventId,
  });

  // Already checked in? Open straight to the success state.
  const { data: checkedInAt } = useQuery({
    queryKey: ['myCheckin', eventId],
    queryFn: () => getMyCheckinTime(eventId!, user!.id),
    enabled: !!eventId && !!user,
  });
  const [doneAt, setDoneAt] = useState<string | null>(null);
  const checkedIn = doneAt ?? checkedInAt ?? null;

  useEffect(() => {
    isLiveScannerAvailable().then(setLiveAvailable);
  }, []);

  const ended = !!event && hasWrapped(event);
  const isParticipant = (event?.participants ?? []).some(
    (p) => p.id === user?.id && p.status === 'approved'
  );

  const flash = (f: Feedback) => {
    setFeedback(f);
    setTimeout(() => setFeedback((cur) => (cur === f ? null : cur)), 3200);
  };

  const apply = (r: CheckinResult) => {
    setScannerOpen(false);
    if (r.status === 'ok' || r.status === 'already') {
      setDoneAt(r.checked_in_at ?? new Date().toISOString());
      qc.invalidateQueries({ queryKey: ['myCheckin', eventId] });
      qc.invalidateQueries({ queryKey: queryKeys.eventDetail.of(eventId) });
    } else if (r.status === 'bad_secret') {
      flash({ tone: 'error', text: "That code isn't for this event's check-in." });
    } else {
      flash({ tone: 'warn', text: "You're not an approved attendee of this event." });
    }
  };

  // ── Live scanner ──
  const openLiveScanner = async () => {
    if (!Scanner) {
      const mod = await import('@/components/events/LiveScanner');
      setScanner(() => mod.default);
    }
    setScannerOpen(true);
  };

  const handleRaw = async (raw: string) => {
    const parsed = parseCheckinPayload(raw);
    if (!parsed || parsed.eventId !== eventId) {
      flash({ tone: 'error', text: "That QR isn't this event's check-in code." });
      return;
    }
    setBusy(true);
    try {
      apply(await checkInWithToken(eventId!, parsed.token));
    } catch {
      flash({ tone: 'error', text: 'Check-in failed. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  // ── Photo scan (works on the current binary) ──
  const scanFromPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera needed', "Allow camera access to scan the host's QR.");
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (shot.canceled) return;
    setBusy(true);
    try {
      const raw = await decodeQrFromJpeg(shot.assets[0].uri);
      if (!raw) {
        flash({ tone: 'error', text: 'No QR found — fill the frame and try again.' });
        return;
      }
      await handleRaw(raw);
    } catch {
      flash({ tone: 'error', text: 'Couldn’t read that. Try the code instead.' });
    } finally {
      setBusy(false);
    }
  };

  // ── Manual code ──
  const submitCode = async () => {
    const c = code.trim().toUpperCase();
    if (c.length < 6) return;
    setBusy(true);
    try {
      apply(await checkInWithCode(eventId!, c));
      setCode('');
    } catch {
      flash({ tone: 'error', text: 'Check-in failed. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Check in" tone="transparent" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {isLoading || !event ? (
          <Loader />
        ) : !isParticipant ? (
          <Text style={styles.notice}>
            Check-in is for approved attendees. Join the event first.
          </Text>
        ) : checkedIn ? (
          // ── Success state ──
          <Animated.View entering={FadeIn.duration(250)} style={styles.doneWrap}>
            <Animated.View entering={ZoomIn.duration(320)} style={styles.doneBadge}>
              <Icon name="check" size={44} color="#fff" strokeWidth={2.6} />
            </Animated.View>
            <Text style={styles.doneTitle}>You're checked in!</Text>
            <Text style={styles.doneSub} numberOfLines={2}>{event.title}</Text>
            <Text style={styles.doneTime}>
              Checked in at {formatEventTime(checkedIn)}
            </Text>
            <Button
  variant="tertiary" label="Done" onPress={() => router.back()} style={{ marginTop: SPACING[5], alignSelf: 'stretch' }} />
          </Animated.View>
        ) : (
          <>
            {/* Event summary */}
            <Animated.View entering={FadeInDown.duration(350)} style={styles.eventRow}>
              <CategoryTile activity={event.activity} size={44} radius={13} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                <View style={styles.metaRow}>
                  <Icon name="clock" size={13} color="rgba(15,24,44,0.6)" />
                  <Text style={styles.metaText}>{formatEventTime(event.starts_at)}</Text>
                </View>
              </View>
            </Animated.View>

            {feedback && (
              <Animated.View
                entering={FadeIn.duration(160)}
                style={[
                  styles.feedback,
                  feedback.tone === 'error' ? styles.feedbackError : styles.feedbackWarn,
                ]}
              >
                <Text style={styles.feedbackText}>{feedback.text}</Text>
              </Animated.View>
            )}

            <Animated.View entering={FadeInDown.delay(40).duration(350)} style={styles.scanCard}>
              <View style={styles.scanIcon}>
                <Icon name="scan" size={34} color={COLORS.primary} strokeWidth={1.8} />
              </View>
              <Text style={styles.scanTitle}>Scan the host's QR</Text>
              <Text style={styles.scanBody}>
                {ended
                  ? 'This event has ended.'
                  : "Point at the QR on the host's phone to check yourself in."}
              </Text>
              <PressableScale
                scaleTo={0.97}
                style={styles.scanBtn}
                onPress={liveAvailable ? openLiveScanner : scanFromPhoto}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Icon name="camera" size={20} color="#fff" strokeWidth={2} />
                    <Text style={styles.scanBtnText}>
                      {liveAvailable ? 'Open scanner' : 'Scan with camera'}
                    </Text>
                  </>
                )}
              </PressableScale>
            </Animated.View>

            {/* Manual code fallback */}
            <Animated.View entering={FadeInDown.delay(70).duration(350)} style={styles.codeCard}>
              <Text style={styles.codeLabel}>Or type the 6-character code</Text>
              <View style={styles.codeInputRow}>
                <TextInput
                  value={code}
                  onChangeText={(t) => setCode(t.toUpperCase().slice(0, 6))}
                  placeholder="AB3 K9Z"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.codeInput}
                  maxLength={6}
                  returnKeyType="done"
                  onSubmitEditing={submitCode}
                />
                <Button
                  variant="primary"
                  label="Check in"
                  height={46}
                  onPress={submitCode}
                  disabled={code.trim().length < 6 || busy}
                  style={{ paddingHorizontal: SPACING[4] }}
                />
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>

      {scannerOpen && Scanner && (
        <Scanner paused={busy} onScan={handleRaw} onClose={() => setScannerOpen(false)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: SPACING[5], paddingTop: SPACING[2.5], gap: SPACING[4], paddingBottom: SPACING[8] },
  notice: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING[12],
    paddingHorizontal: SPACING[6],
  },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3] },
  eventTitle: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.section, color: COLORS.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1], marginTop: SPACING[0.5] },
  metaText: { fontFamily: FONTS.semibold, fontSize: TYPE_SIZE.bodySm, color: 'rgba(15,24,44,0.6)' },
  feedback: { borderRadius: RADIUS.sm, paddingVertical: SPACING[2.5], paddingHorizontal: SPACING[3.5] },
  feedbackError: { backgroundColor: COLORS.error },
  feedbackWarn: { backgroundColor: COLORS.warning },
  feedbackText: { fontFamily: FONTS.semibold, fontSize: TYPE_SIZE.bodySm, color: '#fff' },
  scanCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.07)',
    padding: SPACING[5],
    alignItems: 'center',
    gap: SPACING[2.5],
  },
  scanIcon: {
    width: 68,
    height: 68,
    borderRadius: RADIUS['2xl'],
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[1],
  },
  scanTitle: { fontFamily: FONTS.heavy, fontSize: TYPE_SIZE.sectionLg, color: COLORS.textPrimary },
  scanBody: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: SPACING[2],
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2],
    alignSelf: 'stretch',
    height: 52,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    marginTop: SPACING[2],
  },
  scanBtnText: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.body, color: '#fff' },
  codeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING[3.5],
    gap: SPACING[2.5],
  },
  codeLabel: { fontFamily: FONTS.semibold, fontSize: TYPE_SIZE.bodySm, color: COLORS.textSecondary },
  codeInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  codeInput: {
    flex: 1,
    height: 46,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING[3.5],
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.sectionLg,
    letterSpacing: 3,
    color: COLORS.textPrimary,
  },
  doneWrap: { alignItems: 'center', marginTop: SPACING[10], paddingHorizontal: SPACING[2] },
  doneBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[5],
  },
  doneTitle: { fontFamily: FONTS.heavy, fontSize: TYPE_SIZE.title, color: COLORS.textPrimary },
  doneSub: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING[1.5],
  },
  doneTime: { fontFamily: FONTS.medium, fontSize: TYPE_SIZE.bodySm, color: COLORS.textMuted, marginTop: SPACING[2] },
});
