import { RefObject, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useUIStore } from '@/stores/uiStore';
import { EventBottomSheetRef } from '@/components/events/EventBottomSheet';

// Opens this screen's event bottom sheet when uiStore.selectedEventId is set —
// by a tapped notification (openNotificationTarget) or a deep link
// (app/+native-intent.ts). selectedEventId is read reactively so the effect
// re-runs whether the id was set before this screen mounted (cold-start deep
// link) or after (warm). Only the focused tab reacts, so the sheet opens once
// even though every tab mounts one. On cold start the sheet ref/layout may not
// be ready yet, so we retry across a few frames and clear the id only once we
// actually hand it to the sheet.
export function useSelectedEventSheet(
  sheetRef: RefObject<EventBottomSheetRef | null>
) {
  const selectedEventId = useUIStore((s) => s.selectedEventId);

  useFocusEffect(
    useCallback(() => {
      if (!selectedEventId) return;
      let cancelled = false;
      let tries = 0;
      const tryOpen = () => {
        if (cancelled) return;
        if (sheetRef.current) {
          sheetRef.current.open(selectedEventId);
          useUIStore.getState().setSelectedEvent(null);
        } else if (tries++ < 20) {
          requestAnimationFrame(tryOpen);
        }
      };
      tryOpen();
      return () => {
        cancelled = true;
      };
    }, [selectedEventId, sheetRef])
  );
}
