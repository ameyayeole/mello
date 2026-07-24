# Edge swipe-back gesture

## Problem

Swiping in from the left screen edge to go back is standard iOS behavior, and
`react-native-screens`' native-stack gives it to every "card" (non-modal)
route for free via `gestureEnabled` (defaults to `true`, iOS only). Two gaps:

1. **It's silently broken on `friends/[userId]`.** The screen's "Photos" row
   bleeds all the way to the true screen edge
   (`bleed: { marginHorizontal: -SPACING[5] }`,
   `app/friends/[userId].tsx:848`), so its horizontal `ScrollView` claims
   touches starting at x=0 — the same region the native edge-pop recognizer
   needs to see a touch begin in. Confirmed by isolation test:
   `events/host/[eventId]` (vertical scroll only, no edge-flush horizontal
   scroller) swipes back fine; `friends/[userId]` does not.
2. **Android has no equivalent at all.** `gestureEnabled` is
   `@platform ios`-only in `react-native-screens` — there is no native-stack
   config that turns on edge-swipe-back on Android. It has to be built.

## Fix 1 — iOS: `friends/[userId].tsx`

Change the Photos row's bleed style from a symmetric
`marginHorizontal: -SPACING[5]` to asymmetric, leaving roughly 16pt of
non-scrollable gutter at the true left edge only (the right edge stays fully
bled):

```ts
bleed: { marginLeft: -SPACING[5] + 16, marginRight: -SPACING[5] },
```

16pt is imperceptible against a 20pt bleed visually, but it's enough that a
touch starting at the physical edge lands on the (empty) container instead of
the scroller, giving the native `UIScreenEdgePanGestureRecognizer` a clean
shot at recognizing the gesture before the scroller's pan gesture claims it.

No other screens were found with this pattern (grep for horizontal
`ScrollView`/`FlatList` combined with a full bleed to `SPACING` values found
only this one instance).

## Fix 2 — Android: `useEdgeSwipeBack` hook

New hook, `src/hooks/useEdgeSwipeBack.ts`, built on
`react-native-gesture-handler`'s `Gesture.Pan()` and `react-native-reanimated`:

- **Android only.** Returns an inert (no-op) gesture and identity style on
  iOS — iOS already has this natively, and stacking a second implementation
  on top would double-handle the same swipe.
- **Edge-scoped.** Only recognizes touches starting within ~24pt of the left
  edge, moving rightward (`hitSlop` on the detector view, `activeOffsetX` on
  the gesture). This keeps it from competing with normal horizontal scroll
  content elsewhere on the screen.
- **Light visual follow.** Screen content translates right with the finger,
  capped at ~40% of the raw drag distance, via a shared value.
- **Commit / cancel.** Past a distance or velocity threshold on release,
  calls `router.back()`. Below threshold, springs `translateX` back to 0.
- **Guarded.** No-ops when `router.canGoBack()` is false.

API: returns `{ panGesture, animatedStyle }`. Callers wrap their content:

```tsx
const { panGesture, animatedStyle } = useEdgeSwipeBack();

<GestureDetector gesture={panGesture}>
  <Animated.View style={[{ flex: 1 }, animatedStyle]}>
    {content}
  </Animated.View>
</GestureDetector>
```

## Wiring

- **`Screen`** (`src/components/ui/Screen.tsx`) calls the hook internally and
  wraps its `body` with it whenever `modal={false}` (the existing default).
  A new `edgeSwipeBack?: boolean` prop (default: `true` when non-modal, i.e.
  mirrors the `modal` default) lets a screen opt out explicitly. This means
  all 31 existing `Screen`-based routes get it automatically, no per-screen
  changes.
- **`friends/[userId].tsx`** wires the same hook by hand around its content,
  since it has its own custom top bar rather than using `Screen`.
- **Explicitly excluded, by not wiring the hook there:**
  - `notifications`, `search`, `profile/settings` — these already set
    `gestureEnabled: false` on iOS because their exit is choreographed in JS
    by `useOverlayScreen` (see the comment at `app/_layout.tsx:108-122`); an
    Android swipe gesture that fires `router.back()` mid-transition would
    break the same way.
  - `events/swipe` — a swipe-first card deck (`app/events/swipe.tsx`); an
    edge-back gesture would be ambiguous with the deck's own horizontal swipe.
- Out of scope for this pass, left for a follow-up: other custom-layout
  screens with back navigation that don't use `Screen` (chat DM/thread
  screens, `events/wrap/recap`).

## Testing

No screen/gesture test coverage exists in this repo (Reanimated throws under
Jest — see `AGENTS.md`). This is verified manually on-device only:

- iOS: swipe back on `friends/[userId]` now works (regression check — no
  other `Screen`-based route should change behavior on iOS, since iOS's path
  is untouched by Fix 2).
- Android: swipe back works on a `Screen`-based route (e.g.
  `events/host/[eventId]`) and on `friends/[userId]`; does **not** trigger on
  `notifications`, `search`, `profile/settings`, or `events/swipe`; does not
  fire from a mid-screen horizontal scroll (e.g. the Photos row).
