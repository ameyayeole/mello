import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getReceivedNotes, markNoteOpened } from '@/services/wrap.service';
import { useAuthStore } from '@/stores/authStore';
import { WrapNote } from '@/types/models';

// Notes delivered to the inbox Direct tab. Sealed (unopened) notes render as
// envelope rows above the DM list; opened ones collapse into a small section.
export function useWrapNotes() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const notesQuery = useQuery({
    queryKey: ['wrapNotes', user?.id],
    queryFn: () => getReceivedNotes(user!.id),
    enabled: !!user,
    staleTime: 60_000,
  });

  const sealed = useMemo(
    () => (notesQuery.data ?? []).filter((n) => !n.opened_at),
    [notesQuery.data]
  );
  const opened = useMemo(
    () => (notesQuery.data ?? []).filter((n) => !!n.opened_at),
    [notesQuery.data]
  );

  const open = useMutation({
    mutationFn: (noteId: string) => markNoteOpened(noteId),
    onMutate: async (noteId) => {
      await qc.cancelQueries({ queryKey: ['wrapNotes', user?.id] });
      const prev = qc.getQueryData<WrapNote[]>(['wrapNotes', user?.id]);
      qc.setQueryData<WrapNote[]>(['wrapNotes', user?.id], (notes) =>
        (notes ?? []).map((n) =>
          n.id === noteId ? { ...n, opened_at: new Date().toISOString() } : n
        )
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['wrapNotes', user?.id], ctx.prev);
    },
  });

  return { notesQuery, sealed, opened, open };
}
