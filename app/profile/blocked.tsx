import { useState } from 'react';
import { Text,
  FlatList } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import {
  DISCOVERY_FEED_KEYS,
  queryKeys,
} from '@/constants/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useAuthStore } from '@/stores/authStore';
import { getBlockedUsers, unblockUser } from '@/services/moderation.service';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Profile } from '@/types/models';
import {
  Avatar,
  Button,
  ConfirmDialog,
  EmptyState,
  SkeletonGroup,
} from '@/components/ui';
import { SettingsPanel } from '@/components/profile/SettingsPanel';
import { showError } from '@/utils/errors';
import { themedStyles } from '@/theme';
import { SkeletonPersonRow } from '@/components/skeletons';

export default function BlockedUsersScreen() {
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data: blocked, isLoading } = useQuery({
    queryKey: ['blockedUsers', me?.id],
    queryFn: () => getBlockedUsers(me!.id),
    enabled: !!me,
  });

  // Who the confirm is about. Blocking someone asks first
  // (BlockConfirmDialog), so unblocking — which re-exposes both of you to each
  // other everywhere — should not have been the one that happened on one tap.
  const [pending, setPending] = useState<Profile | null>(null);

  const unblock = useMutation({
    mutationFn: (blockedId: string) => unblockUser(me!.id, blockedId),
    onSuccess: (_d, blockedId) => {
      qc.invalidateQueries({ queryKey: ['blockedUsers', me?.id] });
      qc.invalidateQueries({ queryKey: queryKeys.blocked.of(me?.id, blockedId) });
      // The unblocked host's events can show in the map + Explore feed again.
      for (const queryKey of DISCOVERY_FEED_KEYS) {
        qc.invalidateQueries({ queryKey });
      }
    },
    // Without this a failed unblock did nothing at all — the row stayed, no
    // error was raised, and the only signal was that the list hadn't changed.
    onError: (e) => showError(e),
    onSettled: () => setPending(null),
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
          onPress={() => setPending(item)}
          disabled={unblock.isPending}
        />
      </Animated.View>
    );
  }

  return (
    <SettingsPanel title="Blocked users">

      {isLoading ? (
        <Animated.View exiting={FadeOut.duration(150)}>
          <SkeletonGroup>
            <SkeletonPersonRow count={4} />
          </SkeletonGroup>
        </Animated.View>
      ) : (
        <Animated.View
          style={styles.fill}
          entering={FadeIn.duration(200)}
        >
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
      
        </Animated.View>
      )}

      <ConfirmDialog
        visible={!!pending}
        onClose={() => setPending(null)}
        icon="userPlus"
        title={`Unblock ${pending?.name ?? 'this person'}?`}
        body="You'll be able to see each other's profiles, events and messages again. They won't be told."
        confirmLabel="Unblock"
        onConfirm={() => pending && unblock.mutate(pending.id)}
        loading={unblock.isPending}
      />
    </SettingsPanel>
  );
}

const styles = themedStyles(() => ({
  // The crossfade's container: the content fades in as one piece where the
  // skeleton faded out. `flex: 1` so wrapping a list does not collapse it.
  fill: { flex: 1 },
  list: { padding: SPACING[4], gap: SPACING[2.5] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING[3],
    borderWidth: 1,
    borderColor: COLORS.inkSubtle,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  name: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
}));
