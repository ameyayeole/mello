import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useWrap } from '@/hooks/useWrap';
import { getCoAttendees, getMyVotes } from '@/services/wrap.service';
import { useAuthStore } from '@/stores/authStore';
import { CompleteMoment } from '@/components/wrap/CompleteMoment';
import { SUPERLATIVES } from '@/constants/superlatives';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { CoAttendee, SuperlativeCategory } from '@/types/models';
import { Avatar, Button, Icon, IconButton, PressableScale } from '@/components/ui';

// Vote the four superlatives. Anonymous; winners appear once a category
// has 3+ votes (shown in the recap).
export default function SuperlativesScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const user = useAuthStore((s) => s.user);
  const { vote } = useWrap(eventId);

  const [picking, setPicking] = useState<SuperlativeCategory | null>(null);

  const attendeesQuery = useQuery({
    queryKey: ['wrapAttendees', eventId, user?.id],
    queryFn: () => getCoAttendees(eventId!, user!.id),
    enabled: !!eventId && !!user,
  });
  const votesQuery = useQuery({
    queryKey: ['wrapVotes', eventId, user?.id],
    queryFn: () => getMyVotes(eventId!, user!.id),
    enabled: !!eventId && !!user,
  });

  const myVotes = useMemo(() => {
    const map = new Map<SuperlativeCategory, string>();
    for (const v of votesQuery.data ?? []) map.set(v.category, v.votee_id);
    return map;
  }, [votesQuery.data]);

  const attendeeById = useMemo(() => {
    const map = new Map<string, CoAttendee>();
    for (const a of attendeesQuery.data ?? []) map.set(a.id, a);
    return map;
  }, [attendeesQuery.data]);

  const allVoted = myVotes.size >= SUPERLATIVES.length;

  function castVote(category: SuperlativeCategory, voteeId: string) {
    vote.mutate({ category, voteeId });
    votesQuery.refetch();
    setPicking(null);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton icon="back" variant="ghost" onPress={() => router.back()} accessibilityLabel="Back" />
        <Text style={styles.headerTitle}>Superlatives</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {allVoted ? (
          <View style={styles.completeWrap}>
            <CompleteMoment
              title="All votes in!"
              sub="Winners are revealed once each award has 3 votes. Check the recap."
            >
              <Button
                label="Back to the wrap"
                height={44}
                onPress={() => router.back()}
                style={{ marginTop: 12, alignSelf: 'stretch' }}
              />
            </CompleteMoment>
          </View>
        ) : (
          <Animated.View entering={FadeInDown.duration(300)}>
            <Text style={styles.intro}>
              Hand out the night's awards. Votes are anonymous.
            </Text>
          </Animated.View>
        )}

        {!allVoted &&
          SUPERLATIVES.map((s, i) => {
            const votedFor = myVotes.get(s.id);
            const votee = votedFor ? attendeeById.get(votedFor) : null;
            return (
              <Animated.View
                key={s.id}
                entering={FadeInDown.delay(60 + i * 60).duration(300)}
              >
                <PressableScale
                  scaleTo={0.98}
                  style={[styles.card, votedFor && styles.cardVoted]}
                  onPress={() => setPicking(s.id)}
                  accessibilityRole="button"
                  accessibilityLabel={s.label}
                >
                  <Text style={styles.cardEmoji}>{s.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{s.label}</Text>
                    <Text style={styles.cardSub}>
                      {votee ? `Your pick: ${votee.name}` : s.hint}
                    </Text>
                  </View>
                  {votedFor ? (
                    <View style={styles.votedBadge}>
                      <Icon name="check" size={14} color="#fff" strokeWidth={3} />
                    </View>
                  ) : (
                    <Icon name="chevronRight" size={18} color="rgba(15,24,44,0.35)" />
                  )}
                </PressableScale>
              </Animated.View>
            );
          })}
      </ScrollView>

      {/* Attendee picker */}
      <Modal
        visible={!!picking}
        transparent
        animationType="fade"
        onRequestClose={() => setPicking(null)}
        statusBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={() => setPicking(null)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.pickerTitle}>
              {picking
                ? `${SUPERLATIVES.find((s) => s.id === picking)?.emoji} ${SUPERLATIVES.find((s) => s.id === picking)?.label}`
                : ''}
            </Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {(attendeesQuery.data ?? []).map((a) => {
                const isPick = picking ? myVotes.get(picking) === a.id : false;
                return (
                  <PressableScale
                    key={a.id}
                    scaleTo={0.98}
                    style={styles.pickerRow}
                    onPress={() => picking && castVote(picking, a.id)}
                  >
                    <Avatar name={a.name} photoUrl={a.photo_url} size={40} />
                    <Text style={styles.pickerName}>
                      {a.name}
                      {a.isHost ? '  ·  Host' : ''}
                    </Text>
                    {isPick && (
                      <Icon name="check" size={17} color={COLORS.success} strokeWidth={2.6} />
                    )}
                  </PressableScale>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 17,
    letterSpacing: -0.34,
    color: COLORS.textPrimary,
  },
  scroll: { padding: 18, paddingTop: 10, gap: 12, paddingBottom: 30 },
  completeWrap: { paddingTop: 70, alignItems: 'center' },
  intro: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  cardVoted: {
    borderColor: 'rgba(31,164,99,0.35)',
    backgroundColor: 'rgba(31,164,99,0.05)',
  },
  cardEmoji: { fontSize: 28 },
  cardTitle: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  cardSub: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  votedBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,24,44,0.45)',
    justifyContent: 'flex-end',
  },
  pickerCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
    paddingBottom: 30,
  },
  pickerTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 17,
    letterSpacing: -0.34,
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
  },
  pickerName: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
});
