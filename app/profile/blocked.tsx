import { Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { queryKeys } from '@/constants/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '@/stores/authStore';
import { getBlockedUsers, unblockUser } from '@/services/moderation.service';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Profile } from '@/types/models';
import {
  Avatar,
  Button,
  EmptyState,
  Screen,
  ScreenHeader,
} from '@/components/ui';

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
      qc.invalidateQueries({ queryKey: queryKeys.blocked.of(me?.id, blockedId) });
      // The unblocked host's events can show in the map + Explore feed again.
      qc.invalidateQueries({ queryKey: queryKeys.events.nearby });
      qc.invalidateQueries({ queryKey: queryKeys.exploreFeed.all });
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
        <Button
          label="Unblock"
          size="sm"
          variant="tertiary"
          onPress={() => unblock.mutate(item.id)}
          disabled={unblock.isPending}
        />
      </Animated.View>
    );
  }

  return (
    <Screen>
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
            <EmptyState
              icon="shield"
              title="No blocked users"
              body="People you block will show up here."
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    shadowColor: COLORS.ink,
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
});
