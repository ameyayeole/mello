import { useMemo } from 'react';
import { queryKeys } from '@/constants/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  commentPhoto,
  deletePhotoComment,
  getPhotoComments,
  getWrapPhotos,
  reactToPhoto,
  reportPhoto,
  unreactPhoto,
} from '@/services/wrap.service';
import { useAuthStore } from '@/stores/authStore';
import { useFriends } from '@/hooks/useFriends';
import { PhotoReportReason, WrapPhoto } from '@/types/models';

// The shared photo pool for one event: photos + comments + my likes, with the
// viewer-specific sort the product wants:
//   1. photos where I'm @mentioned (caption or a comment)
//   2. photos uploaded by my friends
//   3. everything else by like count
export function useWrapGallery(eventId: string | undefined) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { friends } = useFriends();

  const photosKey = ['wrapPhotos', eventId];

  const photosQuery = useQuery({
    queryKey: photosKey,
    queryFn: async (): Promise<WrapPhoto[]> => {
      const photos = await getWrapPhotos(eventId!);
      const comments = await getPhotoComments(photos.map((p) => p.id));
      // Reactions arrive embedded on the photo now, so the separate
      // "which did I like" round trip getMyPhotoLikes did is gone.
      return photos.map((p) => ({
        ...p,
        comments: comments.filter((c) => c.photo_id === p.id),
        myReaction:
          (p.reactions ?? []).find((r) => r.user_id === user!.id)?.emoji ?? null,
      }));
    },
    enabled: !!eventId && !!user,
    staleTime: 30_000,
  });

  const friendIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of friends) {
      ids.add(f.requester_id === user?.id ? f.addressee_id : f.requester_id);
    }
    return ids;
  }, [friends, user?.id]);

  const sortedPhotos = useMemo(() => {
    const photos = photosQuery.data ?? [];
    const rank = (p: WrapPhoto): number => {
      const mentionedInCaption = user ? p.mentions.includes(user.id) : false;
      const mentionedInComment = user
        ? (p.comments ?? []).some((c) => c.mentions.includes(user.id))
        : false;
      if (mentionedInCaption || mentionedInComment) return 0;
      if (friendIds.has(p.uploader_id)) return 1;
      return 2;
    };
    return [...photos].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (b.like_count !== a.like_count) return b.like_count - a.like_count;
      return a.created_at.localeCompare(b.created_at);
    });
  }, [photosQuery.data, friendIds, user]);

  const patchPhoto = (photoId: string, patch: (p: WrapPhoto) => WrapPhoto) => {
    qc.setQueryData<WrapPhoto[]>(photosKey, (prev) =>
      (prev ?? []).map((p) => (p.id === photoId ? patch(p) : p))
    );
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: photosKey });
    qc.invalidateQueries({ queryKey: queryKeys.wrap.of(eventId, user?.id) });
  };

  // `emoji: null` means "take mine back". Kept optimistic: a reaction that
  // waits for a round trip feels broken.
  const react = useMutation({
    mutationFn: (args: { photoId: string; emoji: string | null }) =>
      args.emoji
        ? reactToPhoto(args.photoId, user!.id, args.emoji)
        : unreactPhoto(args.photoId, user!.id),
    onMutate: async ({ photoId, emoji }) => {
      await qc.cancelQueries({ queryKey: photosKey });
      const prev = qc.getQueryData<WrapPhoto[]>(photosKey);
      patchPhoto(photoId, (p) => {
        const had = !!p.myReaction;
        // Swapping one emoji for another leaves the total alone — only adding a
        // first reaction or taking it back moves like_count.
        const delta = emoji ? (had ? 0 : 1) : had ? -1 : 0;
        const others = (p.reactions ?? []).filter(
          (r) => r.user_id !== user!.id
        );
        return {
          ...p,
          myReaction: emoji,
          reactions: emoji
            ? [
                ...others,
                {
                  id: `optimistic-${photoId}`,
                  photo_id: photoId,
                  user_id: user!.id,
                  emoji,
                  created_at: new Date().toISOString(),
                },
              ]
            : others,
          like_count: Math.max(0, p.like_count + delta),
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(photosKey, ctx.prev);
    },
    onSettled: invalidate,
  });

  const removeComment = useMutation({
    mutationFn: (args: { photoId: string; commentId: string }) =>
      deletePhotoComment(args.commentId),
    onMutate: async ({ photoId, commentId }) => {
      await qc.cancelQueries({ queryKey: photosKey });
      const prev = qc.getQueryData<WrapPhoto[]>(photosKey);
      patchPhoto(photoId, (p) => ({
        ...p,
        comments: (p.comments ?? []).filter((c) => c.id !== commentId),
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(photosKey, ctx.prev);
    },
    onSettled: invalidate,
  });

  const comment = useMutation({
    mutationFn: (args: {
      photoId: string;
      content: string;
      mentions: string[];
    }) =>
      commentPhoto({
        photoId: args.photoId,
        userId: user!.id,
        content: args.content,
        mentions: args.mentions,
      }),
    onMutate: async ({ photoId, content, mentions }) => {
      await qc.cancelQueries({ queryKey: photosKey });
      const prev = qc.getQueryData<WrapPhoto[]>(photosKey);
      patchPhoto(photoId, (p) => ({
        ...p,
        comments: [
          ...(p.comments ?? []),
          {
            // Replaced by the server's id on the next invalidate. Distinct per
            // comment so a second one in the same thread doesn't collide on
            // React's key.
            id: `optimistic-${photoId}-${Date.now()}`,
            photo_id: photoId,
            user_id: user!.id,
            content,
            mentions,
            created_at: new Date().toISOString(),
            author: user!,
          },
        ],
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(photosKey, ctx.prev);
    },
    onSettled: invalidate,
  });

  const report = useMutation({
    mutationFn: (args: {
      photoId: string;
      reason: PhotoReportReason;
      details?: string;
    }) =>
      reportPhoto({
        photoId: args.photoId,
        reporterId: user!.id,
        reason: args.reason,
        details: args.details,
      }),
    onMutate: async ({ photoId, reason }) => {
      // "I don't want my photo included" hides it for everyone instantly.
      if (reason !== 'remove_me') return {};
      await qc.cancelQueries({ queryKey: photosKey });
      const prev = qc.getQueryData<WrapPhoto[]>(photosKey);
      qc.setQueryData<WrapPhoto[]>(photosKey, (p) =>
        (p ?? []).filter((photo) => photo.id !== photoId)
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(photosKey, ctx.prev);
    },
    onSettled: invalidate,
  });

  return {
    photosQuery,
    sortedPhotos,
    react,
    comment,
    removeComment,
    report,
  };
}
