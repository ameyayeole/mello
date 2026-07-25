import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getPost } from '@/services/community/posts.service';
import { useAuthStore } from '@/stores/authStore';

// One post for the detail screen (deep link / notification tap). Returns null
// when the viewer can't see it (RLS) or it's hidden → the screen shows a
// graceful unavailable state.
export function usePost(postId: string) {
  const viewerId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: queryKeys.community.post.of(postId),
    queryFn: () => getPost(postId, viewerId!),
    enabled: !!viewerId && !!postId,
    staleTime: 30_000,
  });
}
