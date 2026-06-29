import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useFriends } from '@/hooks/useFriends';
import { ACTIVITY_MAP } from '@/constants/activities';
import { COLORS } from '@/constants/colors';
import { Profile } from '@/types/models';

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const { sendRequest, accept, remove, relationshipWith } = useFriends();
  const rel = relationshipWith(userId);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data as Profile;
    },
  });

  function handleAddFriend() {
    sendRequest.mutate(userId, {
      onSuccess: () => Alert.alert('Sent!', 'Friend request sent.'),
      onError: (e: any) => Alert.alert('Error', e.message),
    });
  }

  function handleUnfriend() {
    if (!rel.friendshipId) return;
    Alert.alert(
      'Remove friend',
      `Remove ${profile?.name ?? 'this person'} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfriend',
          style: 'destructive',
          onPress: () =>
            remove.mutate(rel.friendshipId!, {
              onError: (e: any) => Alert.alert('Error', e.message),
            }),
        },
      ]
    );
  }

  if (isLoading || !profile) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>
            {(profile.name?.trim()?.[0] ?? '?').toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{profile.name}</Text>
        {profile.city && <Text style={styles.city}>📍 {profile.city}</Text>}
        {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{profile.events_hosted}</Text>
            <Text style={styles.statLabel}>Events Hosted</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{profile.friends_count}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </View>
          {profile.age && (
            <>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{profile.age}</Text>
                <Text style={styles.statLabel}>Age</Text>
              </View>
            </>
          )}
        </View>

        {(profile.interests?.length ?? 0) > 0 && (
          <View style={styles.interestsSection}>
            <Text style={styles.sectionLabel}>Interests</Text>
            <View style={styles.pills}>
              {profile.interests.map((id) => {
                const a = ACTIVITY_MAP[id];
                if (!a) return null;
                return (
                  <View key={id} style={styles.pill}>
                    <Text style={styles.pillEmoji}>{a.emoji}</Text>
                    <Text style={styles.pillLabel}>{a.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {me?.id !== userId &&
          (rel.status === 'friends' ? (
            <View style={styles.friendActions}>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => router.push(`/(tabs)/chats/dm/${userId}`)}
              >
                <Text style={styles.addBtnText}>💬 Message</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addBtn, styles.statusBtn]}
                onPress={handleUnfriend}
                disabled={remove.isPending}
              >
                <Text style={styles.statusBtnText}>
                  {remove.isPending ? 'Removing…' : '✓ Friends'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : rel.status === 'request_sent' ? (
            <View style={[styles.addBtn, styles.statusBtn]}>
              <Text style={styles.statusBtnText}>Request Sent</Text>
            </View>
          ) : rel.status === 'request_received' ? (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => accept.mutate(rel.friendshipId!)}
            >
              <Text style={styles.addBtnText}>Accept Request</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.addBtn} onPress={handleAddFriend}>
              <Text style={styles.addBtnText}>+ Add Friend</Text>
            </TouchableOpacity>
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: 16 },
  back: { fontSize: 22, color: COLORS.textPrimary },
  scroll: { alignItems: 'center', padding: 24, gap: 12 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 36, fontWeight: '800' },
  name: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary },
  city: { fontSize: 15, color: COLORS.textSecondary },
  bio: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    gap: 20,
    width: '100%',
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
  statLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: COLORS.border },
  interestsSection: { width: '100%' },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillEmoji: { fontSize: 14 },
  pillLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  addBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 100,
    marginTop: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  friendActions: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  statusBtn: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  statusBtnText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 16 },
});
