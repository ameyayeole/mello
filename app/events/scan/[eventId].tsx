import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
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
import { FONTS } from '@/constants/typography';
import { formatEventTime } from '@/utils/time';
import { Button, CategoryTile, Icon, IconButton, PressableScale } from '@/components/ui';
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
    queryKey: ['eventDetail', eventId],
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
      qc.invalidateQueries({ queryKey: ['eventDetail', eventId] });
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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton icon="back" variant="ghost" onPress={() => router.back()} accessibilityLabel="Go back" />
        <Text style={styles.headerTitle}>Check in</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {isLoading || !event ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
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
            <Button label="Done" onPress={() => router.back()} style={{ marginTop: 22, alignSelf: 'stretch' }} />
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
                  label="Check in"
                  height={46}
                  onPress={submitCode}
                  disabled={code.trim().length < 6 || busy}
                  style={{ paddingHorizontal: 18 }}
                />
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>

      {scannerOpen && Scanner && (
        <Scanner paused={busy} onScan={handleRaw} onClose={() => setScannerOpen(false)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FONTS.heavy,
    fontSize: 17,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  scroll: { padding: 20, paddingTop: 10, gap: 16, paddingBottom: 32 },
  notice: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 48,
    paddingHorizontal: 24,
  },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eventTitle: { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  metaText: { fontFamily: FONTS.semibold, fontSize: 13, color: 'rgba(15,24,44,0.6)' },
  feedback: { borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14 },
  feedbackError: { backgroundColor: COLORS.error },
  feedbackWarn: { backgroundColor: COLORS.warning },
  feedbackText: { fontFamily: FONTS.semibold, fontSize: 13, color: '#fff' },
  scanCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.07)',
    padding: 22,
    alignItems: 'center',
    gap: 10,
  },
  scanIcon: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  scanTitle: { fontFamily: FONTS.heavy, fontSize: 18, color: COLORS.textPrimary },
  scanBody: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    marginTop: 8,
  },
  scanBtnText: { fontFamily: FONTS.bold, fontSize: 15.5, color: '#fff' },
  codeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 10,
  },
  codeLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textSecondary },
  codeInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeInput: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    paddingHorizontal: 14,
    fontFamily: FONTS.heavy,
    fontSize: 18,
    letterSpacing: 3,
    color: COLORS.textPrimary,
  },
  doneWrap: { alignItems: 'center', marginTop: 40, paddingHorizontal: 8 },
  doneBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  doneTitle: { fontFamily: FONTS.heavy, fontSize: 22, color: COLORS.textPrimary },
  doneSub: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },
  doneTime: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textMuted, marginTop: 8 },
});
