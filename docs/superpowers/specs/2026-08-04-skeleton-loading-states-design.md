# Skeleton loading states

**Date:** 2026-08-04
**Status:** approved, not yet implemented

## Problem

Two separate things make loading feel wrong, and they are often confused for
each other.

**A spinner tells you nothing about what is coming.** Twenty-two screens render
`<Loader />` — a centred `ActivityIndicator` — and then swap in a list. The
layout jumps at the swap because nothing was holding the space.

**Content arrives one row at a time.** The community feed staggers each post by
`FadeInDown.delay(index * 60)` (`app/(tabs)/community.tsx:295`) and the chats
list staggers each row by 45ms (`app/(tabs)/chats/index.tsx:201`). On a full
screen that is close to half a second of things landing in sequence. It reads as
the app struggling rather than as polish.

**And the chats list has no loading state at all.** While the conversations
query is in flight, `items.length === 0` is true, so
`app/(tabs)/chats/index.tsx:846` renders the *"No event chats yet"* empty state
and then replaces it with the user's chats. Anyone with chats sees a false
"you have nothing" for the length of the fetch.

`ProfilePosts` (`src/components/community/ProfilePosts.tsx:108`) has the same
bug for the same reason: it branches on `posts.length === 0` and never on
`isLoading`, so a profile with posts flashes *"No posts yet."* first.

## Goal

A grey frosted placeholder in the shape of the content, with a light sweeping
left to right across it, replacing the spinner on every screen where a `Loader`
stands in for a list. Content then crossfades in as one piece.

## Non-goals

- Replacing action spinners. The 7 `<Loader inline />` sites are mid-action
  feedback (saving a profile, confirming a scan, sending). They are not standing
  in for content and keep the spinner.
- Skeletons for forms and dashboards. `events/edit`, `events/host`,
  `events/checkin` and `events/scan` load into layouts a skeleton cannot
  predict. They keep the spinner.
- Any new dependency. `react-native-svg` (15.15.4) and `react-native-reanimated`
  (4.3.1) are already in `package.json` and are sufficient.

---

## 1. The engine — `src/components/ui/Skeleton.tsx`

Two exports.

### `SkeletonGroup`

Wraps a screenful of bones and owns **one** shared clock:

```tsx
const progress = useSharedValue(0);
useEffect(() => {
  progress.value = withRepeat(
    withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
    -1,
    false
  );
}, []);
```

The value is published on a React context. Every bone beneath reads the same
shared value, so a chats list of 8 rows × 4 bones runs **one** animation driver,
not 32. This is the reason the group exists — without it each bone would start
its own `withRepeat` loop and they would drift out of phase.

`useReducedMotion()` from Reanimated short-circuits the loop: bones render as
static grey, no sweep. A bone rendered outside a group also renders static
rather than throwing — a missing wrapper should degrade, not crash a screen.

### `SkeletonBone`

One grey shape.

```tsx
<SkeletonBone w={140} h={12} radius={6} />
<SkeletonBone circle size={52} />
```

- `w` accepts a number or a percentage string, so a bone can be "60% of the row".
- Fill is `COLORS.skeletonBone`.
- The sheen is an `Svg` `LinearGradient` band — `skeletonSheen` at 0 opacity →
  full → 0 across three stops — inside an `Animated.View` whose `translateX` is
  driven from the group's progress. The bone has `overflow: 'hidden'`, which
  clips the band to its radius.

**Accepted tradeoff — per-bone sweep.** Each bone sweeps across *its own* width.
All bones are in phase (shared clock) but a 52pt avatar and a 200pt title bar
complete their sweeps at different apparent speeds, so the light does not read
as one continuous beam crossing the screen.

The alternative — a coherent sweep — requires every bone to report its x-offset
within the group via `onLayout`, and the group to publish its own measured
width, so each bone can position the band in group coordinates. That is a
measurement pass per bone plus a frame of layout before the animation can be
correct.

Per-bone is what MUI, Instagram and `react-native-skeleton-placeholder` all
ship, so it is the sweep users have already seen. Start there. The group
already owns the clock, so upgrading to a coherent sweep later is additive —
it does not change any shape file's API.

### Colours

Two new entries in `src/constants/colors.ts`, per the no-hardcoded-colour rule:

- `skeletonBone` — the placeholder fill. Stronger than the existing `inkSubtle`
  (7%), which is tuned for a selected chip and disappears against `glassPanel`.
  Around 9–10% ink; to be confirmed on device.
- `skeletonSheen` — the sweeping light. White, around 45% at the band's centre.

Both need checking against Android's flat-fill glass, which sits at a higher
opacity than the blurred iOS version (`glassPanelSolid` 0.86 vs `glassPanel`
0.68). A sheen calibrated on iOS may be invisible there.

---

## 2. The shapes — `src/components/skeletons/`

Six files. Each accepts `count` and renders itself repeated, so a screen writes
one line. They live in their own folder rather than `ui/` because they are not
primitives and they span three features (community, chat, profile); keeping them
together is what makes it obvious a shape already exists.

| Component | Mirrors | Used by |
| --- | --- | --- |
| `SkeletonPersonRow` | avatar + name + subtitle | friends, blocked, attendees, search, CommentSheet |
| `SkeletonChatRow` | 52pt thumb + title + preview + time | chats list (both tabs) |
| `SkeletonPostCard` | `PostCard` — author row, body lines, action bar | community feed, post detail, ProfilePosts |
| `SkeletonNotifRow` | glyph + two text lines | notifications |
| `SkeletonEventCard` | photo block + title + meta | wishlist |
| `SkeletonBubble` | alternating left/right, varied widths | chat threads |

Two shape notes that matter:

- **`SkeletonChatRow` renders inside the real `Glass` sheet.** The chats list
  puts every row on one continuous frosted panel divided by inset hairlines
  (`app/(tabs)/chats/index.tsx:869`). The skeleton must use the same `Glass
  tier="panel" radius={RADIUS['2xl']}` wrapper and the same `rowDivider`
  treatment, or the sheet itself will appear at the swap.
- **`SkeletonBubble` varies its widths.** Uniform bubbles read as a table.
  A fixed repeating pattern of widths (e.g. 60/85/45/70%) alternating sides is
  enough; no randomness, which would make the layout differ between renders.

Bone geometry copies the real components' tokens — `SkeletonChatRow` uses the
row's actual 52pt thumb, `SPACING[3]` gap and `SPACING[2.5]` vertical padding —
so the skeleton and the content it replaces occupy the same height.

---

## 3. Screens changed

**Get a skeleton (11):**

| Screen | Today |
| --- | --- |
| `app/(tabs)/community.tsx:269` | `<Loader />` |
| `app/(tabs)/chats/index.tsx:846` | *nothing — flashes empty state* |
| `app/(tabs)/chats/[eventId].tsx` | *nothing* |
| `app/(tabs)/chats/dm/[friendId].tsx` | *nothing* |
| `app/search.tsx:342` | `<Loader />` |
| `app/notifications.tsx:825` | `<Loader />` |
| `app/post/[postId].tsx:87` | `<Loader />` |
| `app/events/wishlist.tsx:204` | `<Loader />` |
| `app/profile/blocked.tsx:82` | `<Loader />` |
| `app/events/attendees/[eventId].tsx:78` | `<Loader />` |
| `src/components/community/CommentSheet.tsx:197` | `<Loader />` |

Plus `src/components/profile/ProfileBottomSheet.tsx:166` (`<Loader />`) and
`src/components/community/ProfilePosts.tsx:108`, which has the **same
flash-empty bug as the chats list** — it runs an infinite query but branches
only on `posts.length === 0`, so it shows *"No posts yet."* to someone who has
posts, for the length of the fetch. Both use `SkeletonPostCard`.

**Keep the spinner (4 + 7 inline):** `events/edit`, `events/host`,
`events/checkin`, `events/scan`, and every `<Loader inline />`.

**`Loader.tsx`'s comment is now wrong** and must be rewritten. It currently
says *"Deliberately not a skeleton. Skeletons need to know the shape of the
content they stand in for, which means one per surface, not one shared
component."* The premise held; the conclusion no longer does — the shapes are
shared per *family*, not per surface. Replace it with the rule: an inline
action spinner is a `Loader`; anything standing in for a list is a skeleton.

---

## 4. Motion

Per-item `entering` comes off both staggered lists. `useArrivalAnimation`
(`app/(tabs)/chats/index.tsx:125`, ~25 lines plus its rationale comment) is
deleted along with the `animate` prop it feeds, since nothing else reads it.

The swap becomes: skeleton exits `FadeOut.duration(150)`, list enters
`FadeIn.duration(200)` as a whole. Both branches of the ternary must be
`Animated.View` for the exiting animation to run.

**`LinearTransition` on chat rows stays.** It is the re-sort glide when a new
message lifts a chat to the top — motion that marks a change, not motion that
marks an arrival. Removing it would be a different regression.

---

## 5. What breaks silently

- **`Glass` on Android.** No backdrop blur, so the panel is a flat fill at a
  higher opacity. A sheen tuned on iOS may wash out entirely. This is the single
  highest-risk item and cannot be checked without a device.
- **Skeleton height ≠ content height.** If a bone stack is shorter or taller
  than the row it replaces, the crossfade will visibly shift the list. No test
  catches this; it needs eyes on each of the 11 screens.
- **Shape drift.** When someone changes a real row's padding, the skeleton will
  not follow, and nothing will fail. Mitigated by the shapes reading the same
  `SPACING`/`RADIUS` tokens rather than literals, but not eliminated.
- **A skeleton that never resolves.** Any screen where `isLoading` can stay true
  now shows an animating placeholder forever instead of a spinner forever.
  Equally broken, more convincingly.

---

## 6. Verification

`npm run typecheck` (0), `npm test` (green), `npm run lint` (no new warnings).

**No component tests are possible.** Reanimated 4 throws on import under Jest,
which is why `src/**/__tests__/` covers only utils, services and hooks. There is
no logic here worth extracting to a plain factory — the whole component is
layout and animation. So `tsc` passing says nothing about whether this looks
right.

This ships with a device sheet at `docs/testing/skeleton-loading.md`, ordered by
risk rather than by feature:

1. **Android glass** — is the sheen visible on the flat-fill panel at all
2. **Layout continuity** — does each of the 11 screens hold its height across
   the swap
3. **The flash-empty bugs** — confirm a user with chats never sees "No event
   chats yet", and a profile with posts never sees "No posts yet."
4. **Reduced motion** — static grey, no sweep
5. **Slow network** — throttled, does the loop stay smooth over several seconds

Rows 1 and 4 are checking *reasoning* — the Android fallback and the
`useReducedMotion` path are both inferred from the code, not observed.
