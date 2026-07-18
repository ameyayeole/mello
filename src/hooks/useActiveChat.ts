import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useUIStore } from '@/stores/uiStore';

// Marks a chat thread as the one on screen while it's focused, so
// useNotifications can suppress the in-app banner for messages that land in it.
// key is "event:<eventId>" or "dm:<friendId>".
export function useActiveChat(key: string | null | undefined) {
  useFocusEffect(
    useCallback(() => {
      if (!key) return;
      useUIStore.getState().setActiveChat(key);
      return () => {
        if (useUIStore.getState().activeChat === key) {
          useUIStore.getState().setActiveChat(null);
        }
      };
    }, [key])
  );
}
