import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  commentPhoto,
  getMyPhotoLikes,
  getPhotoComments,
  getWrapPhotos,
  likePhoto,
  reportPhoto,
  unlikePhoto,
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
      const [comments, myLikes] = await Promise.all([
        getPhotoComments(photos.map((p) => p.id)),
        getMyPhotoLikes(eventId!, user!.id),
      ]);
      const liked = new Set(myLikes);
      return photos.map((p) => ({
        ...p,
        comments: comments.filter((c) => c.photo_id === p.id),
        myLike: liked.has(p.id),
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
    qc.invalidateQueries({ queryKey: ['wrap', eventId, user?.id] });
  };

  const like = useMutation({
    mutationFn: (args: { photoId: string; liked: boolean }) =>
      args.liked
        ? unlikePhoto(args.photoId, user!.id)
        : likePhoto(args.photoId, user!.id),
    onMutate: async ({ photoId, liked }) => {
      await qc.cancelQueries({ queryKey: photosKey });
      const prev = qc.getQueryData<WrapPhoto[]>(photosKey);
      patchPhoto(photoId, (p) => ({
        ...p,
        myLike: !liked,
        like_count: Math.max(0, p.like_count + (liked ? -1 : 1)),
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
    like,
    comment,
    report,
  };
}
