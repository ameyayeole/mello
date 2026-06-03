import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  TextInput,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFriends } from '@/hooks/useFriends';
import { usePresence } from '@/hooks/usePresence';
import { useAuthStore } from '@/stores/authStore';
import { searchUsers, sendFriendRequest } from '@/services/friends.service';
import { COLORS } from '@/constants/colors';
import { Profile, Friendship } from '@/types/models';

function FriendRow({
  friendship,
  isOnline,
}: {
  friendship: Friendship;
  isOnline: boolean;
}) {
  const friend = friendship.friend!;
  return (
    <View style={styles.friendRow}>
      <View style={styles.avatarWrapper}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>
            {friend.name[0].toUpperCase()}
          </Text>
        </View>
        <View
          style={[styles.onlineDot, !isOnline && styles.offlineDot]}
        />
      </View>
      <View style={styles.friendInfo}>
        <Text style={styles.friendName}>{friend.name}</Text>
        <Text style={styles.friendStatus}>
          {isOnline ? 'Online now' : 'Offline'}
        </Text>
      </View>
    </View>
  );
}

export default function FriendsScreen() {
  const user = useAuthStore((s) => s.user);
  const { friendsQuery, pendingQuery, accept, remove } = useFriends();
  const { isOnline } = usePresence();
  const [searchQuery, setSearchQuery] = useState('');
  const qc = useQueryClient();

  const searchResultsQuery = useQuery({
    queryKey: ['userSearch', searchQuery],
    queryFn: () => searchUsers(searchQuery),
    enabled: searchQuery.length >= 2,
  });

  async function handleAddFriend(targetId: string) {
    try {
      await sendFriendRequest(user!.id, targetId);
      Alert.alert('Sent!', 'Friend request sent.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  const friends = friendsQuery.data ?? [];
  const pending = pendingQuery.data ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Friends</Text>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search people..."
          placeholderTextColor={COLORS.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {searchQuery.length >= 2 ? (
        <FlatList
          data={searchResultsQuery.data?.filter((u) => u.id !== user?.id) ?? []}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <View style={styles.searchRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarInitial}>{item.name[0].toUpperCase()}</Text>
              </View>
              <Text style={styles.friendName}>{item.name}</Text>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => handleAddFriend(item.id)}
              >
                <Text style={styles.addBtnText}>+ Add</Text>
              </TouchableOpacity>
            </View>
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No users found.</Text>
          }
        />
      ) : (
        <FlatList
          data={[
            ...pending.map((p) => ({ type: 'pending' as const, data: p })),
            ...friends.map((f) => ({ type: 'friend' as const, data: f })),
          ]}
          keyExtractor={(item) => item.data.id}
          renderItem={({ item }) => {
            if (item.type === 'pending') {
              const req = item.data as Friendship;
              return (
                <View style={styles.pendingRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarInitial}>
                      {(req as any).requester?.name?.[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <Text style={styles.friendName}>
                    {(req as any).requester?.name} wants to be friends
                  </Text>
                  <TouchableOpacity
                    style={styles.acceptBtn}
                    onPress={() => accept.mutate(req.id)}
                  >
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  </TouchableOpacity>
                </View>
              );
            }
            const f = item.data as Friendship;
            return <FriendRow friendship={f} isOnline={isOnline(f.friend?.id ?? '')} />;
          }}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            pending.length > 0 ? (
              <Text style={styles.sectionLabel}>
                Pending requests ({pending.length})
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>👥</Text>
              <Text style={styles.emptyTitle}>No friends yet</Text>
              <Text style={styles.emptyText}>
                Search for people to add as friends.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: 20, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary },
  searchBar: { paddingHorizontal: 16, marginBottom: 8 },
  searchInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  list: { padding: 16, gap: 4 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    marginBottom: 8,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    marginBottom: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    marginBottom: 8,
  },
  avatarWrapper: { position: 'relative' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontWeight: '700', fontSize: 18 },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.online,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  offlineDot: { backgroundColor: COLORS.textMuted },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  friendStatus: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  addBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  acceptBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
  },
  acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  emptyText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
