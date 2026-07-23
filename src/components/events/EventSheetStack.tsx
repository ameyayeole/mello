import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import EventBottomSheet from './EventBottomSheet';

// Imperative handle kept identical to the old EventBottomSheet, so every call
// site (`sheetRef.current?.open(id)` / `.close()`) is unchanged — they just
// mount <EventSheetStack> instead.
export interface EventSheetStackRef {
  open: (eventId: string) => void;
  close: () => void;
}

// How many stacked sheets are actually rendered at once. A "Happening near you"
// tap pushes a new event *above* the current sheet rather than replacing it, so
// you can drill in and back out. Only the top two are mounted (the top, plus the
// one directly behind it so you see it peeking); anything deeper is kept as just
// an id and re-mounted from the React Query cache when you pop back to it — so
// memory stays flat no matter how many times you drill in.
const MAX_RENDERED = 2;

// Manages the stack of event ids and renders the live sheets. The sheet itself
// (EventBottomSheet) is a controlled component that opens itself on mount and
// reports back through the callbacks below.
const EventSheetStack = forwardRef<EventSheetStackRef, object>(
  function EventSheetStack(_props, ref) {
    const [stack, setStack] = useState<string[]>([]);

    useImperativeHandle(
      ref,
      () => ({
        open: (eventId: string) => setStack([eventId]),
        close: () => setStack([]),
      }),
      []
    );

    const push = useCallback(
      (eventId: string) => setStack((s) => [...s, eventId]),
      []
    );
    // A navigation action (Open chat, Manage…) leaves the sheets entirely.
    const closeAll = useCallback(() => setStack([]), []);

    // Only the top `MAX_RENDERED` entries are mounted.
    const firstRendered = Math.max(0, stack.length - MAX_RENDERED);

    return (
      <>
        {stack.map((eventId, i) => {
          if (i < firstRendered) return null;
          const isTop = i === stack.length - 1;
          return (
            <EventBottomSheet
              // Index in the key: a nested event can repeat an id, and popping
              // must not confuse the two.
              key={`${i}:${eventId}`}
              eventId={eventId}
              depth={i + 1}
              isTop={isTop}
              onPush={push}
              // Dismiss pops THIS entry, but only while it's still the top — the
              // same onClose fires again as the sheet unmounts, and this guard
              // stops that second call from popping the parent too.
              onDismiss={() =>
                setStack((s) => (s.length === i + 1 ? s.slice(0, -1) : s))
              }
              onCloseAll={closeAll}
            />
          );
        })}
      </>
    );
  }
);

export default EventSheetStack;
