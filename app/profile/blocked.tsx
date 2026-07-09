import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '@/stores/authStore';
import { getBlockedUsers, unblockUser } from '@/services/moderation.service';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Profile } from '@/types/models';
import { Avatar, Icon, PressableScale, ScreenHeader } from '@/components/ui';

export default function BlockedUsersScreen() {
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data: blocked, isLoading } = useQuery({
    queryKey: ['blockedUsers', me?.id],
    queryFn: () => getBlockedUsers(me!.id),
    enabled: !!me,
  });

  const unblock = useMutation({
    mutationFn: (blockedId: string) => unblockUser(me!.id, blockedId),
    onSuccess: (_d, blockedId) => {
      qc.invalidateQueries({ queryKey: ['blockedUsers', me?.id] });
      qc.invalidateQueries({ queryKey: ['blocked', me?.id, blockedId] });
      // The unblocked host's events can show in the map + Explore feed again.
      qc.invalidateQueries({ queryKey: ['events', 'nearby'] });
      qc.invalidateQueries({ queryKey: ['exploreFeed'] });
    },
  });

  function renderItem({ item, index }: { item: Profile; index: number }) {
    const photo = item.photos?.[0] ?? item.photo_url ?? null;
    return (
      <Animated.View
        entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}
        style={styles.row}
      >
        <Avatar name={item.name} photoUrl={photo} size={44} />
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <PressableScale
          scaleTo={0.92}
          style={styles.unblockBtn}
          onPress={() => unblock.mutate(item.id)}
          disabled={unblock.isPending}
        >
          <Text style={styles.unblockText}>Unblock</Text>
        </PressableScale>
      </Animated.View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Blocked users" />

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={blocked ?? []}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Icon name="shield" size={36} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>No blocked users</Text>
              <Text style={styles.emptyText}>
                People you block will show up here.
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
  list: { padding: 16, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.07)',
    shadowColor: '#0F182C',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  name: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    color: COLORS.textPrimary,
  },
  unblockBtn: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unblockText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.textPrimary,
  },
  empty: { alignItems: 'center', paddingTop: 70, gap: 8 },
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
  },
});
