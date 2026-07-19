import { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { getEventDetail } from '@/services/events.service';
import {
  buildCheckinPayload,
  getCheckinQr,
  getCheckinTimes,
} from '@/services/checkin.service';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import TicketQR from '@/components/events/TicketQR';
import { Avatar, Icon, IconButton, PressableScale } from '@/components/ui';

// Host's door screen: displays the event's single check-in QR + read-aloud code,
// and a live roster of who has scanned in.
export default function HostCheckinScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data: event, isLoading } = useQuery({
    queryKey: ['eventDetail', eventId],
    queryFn: () => getEventDetail(eventId),
    enabled: !!eventId,
  });

  const isHost = !!event && event.host_id === user?.id;

  const {
    data: qr,
    isLoading: qrLoading,
    isError: qrError,
    refetch: refetchQr,
  } = useQuery({
    queryKey: ['checkinQr', eventId],
    queryFn: () => getCheckinQr(eventId!),
    enabled: !!eventId && isHost,
    staleTime: Infinity,
    retry: 1,
  });

  const { data: checkins = {} } = useQuery({
    queryKey: ['checkinTimes', eventId],
    queryFn: () => getCheckinTimes(eventId!),
    enabled: !!eventId && isHost,
    refetchInterval: 6000,
  });

  const attendees = useMemo(
    () =>
      (event?.participants ?? [])
        .filter((p) => p.status === 'approved' && p.id !== event?.host_id)
        .sort((a, b) => {
          const ain = checkins[a.id] ? 1 : 0;
          const bin = checkins[b.id] ? 1 : 0;
          if (ain !== bin) return bin - ain; // checked-in first
          return (a.name ?? '').localeCompare(b.name ?? '');
        }),
    [event, checkins]
  );
  const inCount = attendees.filter((p) => checkins[p.id]).length;

  const rotate = () => {
    Alert.alert(
      'New code?',
      'This makes a fresh QR and code. The old one stops working — use this if the code leaked.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rotate',
          style: 'destructive',
          onPress: async () => {
            await getCheckinQr(eventId!, true);
            qc.invalidateQueries({ queryKey: ['checkinQr', eventId] });
          },
        },
      ]
    );
  };

  if (isLoading || !event) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!isHost) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <IconButton
            icon="back"
            variant="ghost"
            color="#fff"
            style={styles.headerBtn}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          />
        </View>
        <Text style={styles.notHost}>Only the host can run check-in.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <IconButton
          icon="back"
          variant="ghost"
          color="#fff"
          style={styles.headerBtn}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>Check in guests</Text>
          <Text style={styles.headerSub}>
            {inCount} of {attendees.length} checked in
          </Text>
        </View>
        <IconButton
          icon="refresh"
          variant="ghost"
          color="#fff"
          style={styles.headerBtn}
          onPress={rotate}
          accessibilityLabel="Rotate code"
        />
      </View>

      <FlatList
        data={attendees}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 8 }}>
            {/* The QR guests scan */}
            <Animated.View entering={FadeInDown.duration(350)} style={styles.qrCard}>
              <Text style={styles.qrHint}>Guests scan this to check in</Text>
              <View style={styles.qrBox}>
                {qr ? (
                  <TicketQR value={buildCheckinPayload(event.id, qr.token)} size={236} />
                ) : qrError ? (
                  <PressableScale style={styles.qrPlaceholder} onPress={() => refetchQr()}>
                    <Icon name="refresh" size={26} color={COLORS.textMuted} />
                    <Text style={styles.qrErrorText}>
                      Couldn't load the code. Tap to retry.
                    </Text>
                  </PressableScale>
                ) : (
                  <View style={styles.qrPlaceholder}>
                    <ActivityIndicator color={COLORS.primary} />
                  </View>
                )}
              </View>
              <View style={styles.divider}>
                <View style={styles.notchLeft} />
                <View style={styles.dashLine} />
                <View style={styles.notchRight} />
              </View>
              <Text style={styles.codeLabel}>Can't scan? Read out this code</Text>
              <Text style={styles.code}>
                {qr ? `${qr.code.slice(0, 3)} ${qr.code.slice(3)}` : '· · ·'}
              </Text>
            </Animated.View>

            <View style={styles.eventBlock}>
              <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
              <Text style={styles.eventHint}>
                Ask guests to scan this from their Mello app to check in.
              </Text>
            </View>

            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${attendees.length ? (inCount / attendees.length) * 100 : 0}%` },
                ]}
              />
            </View>

            <Text style={styles.sectionTitle}>Attendees · {attendees.length}</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const at = checkins[item.id];
          return (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 20).duration(300)}>
              <View style={styles.row}>
                <Avatar name={item.name} photoUrl={item.photo_url} size={44} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                  {item.username && (
                    <Text style={styles.rowSub} numberOfLines={1}>@{item.username}</Text>
                  )}
                </View>
                {at ? (
                  <View style={styles.inPill}>
                    <Icon name="check" size={14} color={COLORS.success} strokeWidth={2.4} />
                    <Text style={styles.inPillText}>In</Text>
                  </View>
                ) : (
                  <Text style={styles.waiting}>Not yet</Text>
                )}
              </View>
            </Animated.View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No approved attendees yet.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.accent },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerBtn: { backgroundColor: 'rgba(255,255,255,0.12)' },
  headerTitle: {
    fontFamily: FONTS.heading,
    fontSize: 18,
    letterSpacing: -0.3,
    color: '#fff',
  },
  headerSub: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 1,
  },
  notHost: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 40,
  },
  list: { padding: 20, paddingTop: 8, gap: 12, paddingBottom: 40 },
  qrCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    paddingVertical: 26,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  qrHint: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textSecondary },
  eventBlock: { alignItems: 'center', gap: 6, marginTop: 4 },
  eventTitle: {
    fontFamily: FONTS.heading,
    fontSize: 20,
    letterSpacing: -0.4,
    color: '#fff',
  },
  eventHint: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  qrBox: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.06)',
  },
  qrPlaceholder: {
    width: 236,
    height: 236,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  qrErrorText: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    height: 24,
  },
  notchLeft: {
    width: 12, height: 24,
    borderTopRightRadius: 12, borderBottomRightRadius: 12,
    backgroundColor: COLORS.accent,
  },
  dashLine: {
    flex: 1,
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.15)',
  },
  notchRight: {
    width: 12, height: 24,
    borderTopLeftRadius: 12, borderBottomLeftRadius: 12,
    backgroundColor: COLORS.accent,
  },
  codeLabel: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textMuted, marginBottom: -8 },
  code: {
    fontFamily: FONTS.heavy,
    fontSize: 30,
    letterSpacing: 5,
    color: COLORS.textPrimary,
  },
  progressCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    alignItems: 'center',
  },
  progressCount: { fontFamily: FONTS.heavy, fontSize: 34, color: COLORS.textPrimary },
  progressTotal: { fontSize: 22, color: COLORS.textMuted },
  progressLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  progressBar: {
    alignSelf: 'stretch',
    height: 7,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 100, backgroundColor: COLORS.success },
  sectionTitle: {
    fontFamily: FONTS.heading,
    fontSize: 15,
    color: '#fff',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 12,
  },
  rowName: { fontFamily: FONTS.bold, fontSize: 14.5, color: '#fff' },
  rowSub: { fontFamily: FONTS.medium, fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginTop: 1 },
  inPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 100,
    backgroundColor: 'rgba(23,145,90,0.25)',
  },
  inPillText: { fontFamily: FONTS.bold, fontSize: 12.5, color: '#3ED88A' },
  waiting: { fontFamily: FONTS.semibold, fontSize: 12.5, color: 'rgba(255,255,255,0.4)' },
  empty: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: 24,
  },
});
