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
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFriends } from '@/hooks/useFriends';
import { usePresence } from '@/hooks/usePresence';
import { useAuthStore } from '@/stores/authStore';
import { searchUsers } from '@/services/friends.service';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Friendship } from '@/types/models';
import {
  Avatar,
  Icon,
  IconButton,
  PressableScale,
  SectionLabel,
} from '@/components/ui';

function FriendRow({
  friendship,
  isOnline,
  onPress,
}: {
  friendship: Friendship;
  isOnline: boolean;
  onPress: () => void;
}) {
  const friend = friendship.friend;
  if (!friend) return null;
  return (
    <PressableScale style={styles.friendRow} scaleTo={0.98} onPress={onPress}>
      <Avatar
        name={friend.name}
        photoUrl={friend.photo_url}
        size={46}
        online={isOnline}
      />
      <View style={styles.friendInfo}>
        <Text style={styles.friendName}>{friend.name}</Text>
        <Text
          style={[styles.friendStatus, isOnline && { color: COLORS.success }]}
        >
          {isOnline ? 'Active now' : 'Offline'}
        </Text>
      </View>
      <Icon name="chevronRight" size={20} color="rgba(15,24,44,0.35)" />
    </PressableScale>
  );
}

export default function FriendsScreen() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const { friends, pending, sendRequest, accept, remove, relationshipWith } =
    useFriends();
  const { isOnline } = usePresence();
  const [searchQuery, setSearchQuery] = useState('');

  function openProfile(userId: string) {
    router.push(`/friends/${userId}`);
  }

  const searchResultsQuery = useQuery({
    queryKey: ['userSearch', searchQuery, user?.id],
    queryFn: () => searchUsers(searchQuery, user?.id),
    enabled: searchQuery.length >= 2,
  });

  function handleAddFriend(targetId: string) {
    sendRequest.mutate(targetId, {
      onSuccess: () => Alert.alert('Sent!', 'Friend request sent.'),
      onError: (e: any) => Alert.alert('Error', e.message),
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          variant="ghost"
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Text style={styles.title}>Friends</Text>
        <View style={styles.headerIcon}>
          <Icon name="userPlus" size={21} />
        </View>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Icon name="search" size={17} color="rgba(15,24,44,0.45)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Find friends"
            placeholderTextColor="rgba(15,24,44,0.45)"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {searchQuery.length >= 2 ? (
        <FlatList
          data={searchResultsQuery.data?.filter((u) => u.id !== user?.id) ?? []}
          keyExtractor={(u) => u.id}
          renderItem={({ item, index }) => {
            const rel = relationshipWith(item.id);
            return (
              <Animated.View
                entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}
                style={styles.searchRow}
              >
                <TouchableOpacity
                  style={styles.searchRowMain}
                  onPress={() => openProfile(item.id)}
                  activeOpacity={0.7}
                >
                  <Avatar name={item.name} photoUrl={item.photo_url} size={46} />
                  <View style={styles.searchRowInfo}>
                    <Text style={styles.friendName}>{item.name}</Text>
                    {item.username ? (
                      <Text style={styles.searchUsername}>@{item.username}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
                {rel.status === 'friends' ? (
                  <Text style={styles.statusLabel}>Friends</Text>
                ) : rel.status === 'request_sent' ? (
                  <PressableScale
                    scaleTo={0.92}
                    style={styles.requestedBtn}
                    onPress={() => remove.mutate(rel.friendshipId!)}
                  >
                    <Text style={styles.requestedBtnText}>Requested</Text>
                  </PressableScale>
                ) : rel.status === 'request_received' ? (
                  <PressableScale
                    scaleTo={0.92}
                    style={styles.acceptBtn}
                    onPress={() => accept.mutate(rel.friendshipId!)}
                  >
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  </PressableScale>
                ) : (
                  <PressableScale
                    scaleTo={0.92}
                    style={styles.addBtn}
                    onPress={() => handleAddFriend(item.id)}
                  >
                    <Text style={styles.addBtnText}>Add</Text>
                  </PressableScale>
                )}
              </Animated.View>
            );
          }}
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
          renderItem={({ item, index }) => {
            if (item.type === 'pending') {
              const req = item.data as Friendship;
              const requester = (req as any).requester;
              return (
                <Animated.View
                  entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}
                >
                  {index === 0 && (
                    <SectionLabel style={styles.sectionLabel}>
                      Requests · {pending.length}
                    </SectionLabel>
                  )}
                  <View style={styles.pendingRow}>
                    <Avatar
                      name={requester?.name}
                      photoUrl={requester?.photo_url}
                      size={46}
                    />
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>{requester?.name}</Text>
                      <Text style={styles.friendStatus}>
                        wants to be friends
                      </Text>
                    </View>
                    <PressableScale
                      scaleTo={0.92}
                      style={styles.acceptBtn}
                      onPress={() => accept.mutate(req.id)}
                    >
                      <Text style={styles.acceptBtnText}>Accept</Text>
                    </PressableScale>
                    <PressableScale
                      scaleTo={0.92}
                      style={styles.declineBtn}
                      onPress={() => remove.mutate(req.id)}
                      accessibilityLabel="Decline request"
                    >
                      <Icon name="close" size={16} color="rgba(15,24,44,0.55)" />
                    </PressableScale>
                  </View>
                </Animated.View>
              );
            }
            const f = item.data as Friendship;
            const firstFriend = pending.length > 0 ? pending.length : 0;
            return (
              <Animated.View
                entering={FadeInDown.delay(Math.min(index, 10) * 40).duration(300)}
              >
                {index === firstFriend && (
                  <SectionLabel style={styles.sectionLabel}>
                    All friends · {friends.length}
                  </SectionLabel>
                )}
                <FriendRow
                  friendship={f}
                  isOnline={isOnline(f.friend?.id ?? '')}
                  onPress={() => f.friend && openProfile(f.friend.id)}
                />
              </Animated.View>
            );
          }}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Icon name="userPlus" size={38} color={COLORS.primary} />
              </View>
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
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  title: {
    flex: 1,
    fontFamily: FONTS.heavy,
    fontSize: 24,
    letterSpacing: -0.48,
    color: COLORS.textPrimary,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: { paddingHorizontal: 20, paddingBottom: 12 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 42,
    paddingHorizontal: 15,
    backgroundColor: COLORS.background,
    borderRadius: 100,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  sectionLabel: { marginTop: 8, marginBottom: 8, fontSize: 12 },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
  },
  searchRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  friendInfo: { flex: 1, minWidth: 0 },
  searchRowInfo: { flex: 1, minWidth: 0 },
  searchUsername: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  friendName: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  friendStatus: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: 'rgba(15,24,44,0.5)',
    marginTop: 1,
  },
  addBtn: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { fontFamily: FONTS.bold, color: '#fff', fontSize: 12.5 },
  statusLabel: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.textSecondary,
    paddingHorizontal: 10,
  },
  requestedBtn: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestedBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.textSecondary,
  },
  declineBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: { fontFamily: FONTS.bold, color: '#fff', fontSize: 12.5 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    paddingTop: 20,
  },
});
