# Wrap Phase 2b — the flow's interactions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the contribution flow feel like the approved prototype — a 4:5
photo carousel, the note button on the person's card, a Skip for big events, an
optional thumbs-down reason that routes safety separately from taste, and a
rewind you have to hold.

**Architecture:** No new screens and no new data model. Every task changes
behaviour *inside* a step 2a already moved, which is why the two are separate
plans: a regression here bisects to a behaviour commit, not a move commit.

**Tech Stack:** Reanimated 4, react-native-gesture-handler, expo-haptics,
Supabase, Jest.

## Global Constraints

- **Steps take NO props.** `memo` holding them is the reason the gesture deck
  does not drop frames. Adding one prop undoes it silently. (`AGENTS.md`)
- **A new field goes in `wrapFlowStore`, not a `useState`.**
- Never hardcode a colour, font family or radius — `COLORS` / `FONTS` /
  `RADIUS` / `SPACING` / `TYPE_SIZE`.
- **No emoji.** `Icon` is backed by `react-native-solar-icons`; verified present:
  `Like`, `Dislike`, `RewindBack`, `GalleryAdd`, `PenNewSquare`,
  `UsersGroupRounded`, `LockKeyhole`.
- **Glass on a photo is the `onPhoto` tier** — `rgba(15,24,44,0.46)`, white
  contents, `1px rgba(255,255,255,0.18)`. It is the one dark tier and it exists
  so text stays legible over a bright photo and a dark one alike. A white chip
  on a portrait punches a hole in it. (`DESIGN.md` §3)
- **Haptics go through `haptic()`** in `src/components/ui/dealtCardGeometry.ts`
  — one vocabulary, already agreed between two surfaces. Do not call
  `expo-haptics` directly.

**Depends on Phase 2a.** Every task edits a file 2a created.

**Verification baseline:** `npm run typecheck` → 0 · `npm test` → green ·
`npm run lint` → 0 errors / 65 warnings pre-existing, do not add.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/components/wrap/flow/steps/StepPhotos.tsx` | 4:5 carousel replaces the grid |
| `src/components/wrap/PhotoCarousel.tsx` | **new** — the 4:5 carousel itself |
| `src/components/wrap/RateCard.tsx` | note button on the card, in `onPhoto` glass |
| `src/components/wrap/flow/steps/StepRate.tsx` | Skip above 15; reason chips |
| `src/components/wrap/ReasonChips.tsx` | **new** — the thumbs-down chip row |
| `src/services/wrap.service.ts` | `reportAttendee` |
| `src/utils/wrapRating.ts` | **new** — which chips file a report |
| `src/utils/__tests__/wrapRating.test.ts` | **new** — its tests |
| `src/components/wrap/flow/steps/StepRewind.tsx` | press-and-hold |
| `src/components/wrap/HoldToConfirm.tsx` | **new** — the hold gesture + ring |

---

### Task 1: The 4:5 photo carousel

**Files:**
- Create: `src/components/wrap/PhotoCarousel.tsx`
- Modify: `src/components/wrap/flow/steps/StepPhotos.tsx`

**Interfaces:**
- Produces:
  `<PhotoCarousel uris={(string|null)[]} index={number} onIndexChange={(i:number)=>void} onPick={(i:number)=>void} />`

This is the one component in 2b that takes props — it is a leaf presentational
component, not a step. The no-props rule applies to **steps**.

Design notes, from spec §5.1:
- Five slots, **4:5 only**. The next frame sits just past the screen edge so the
  swipe is self-evident without an instruction.
- Locking the ratio is the point: the wrap grid, the shared-wrap card's
  `top_photos` and the recap all inherit this shape. Mixed ratios means four
  separate places each invent a crop.

- [ ] **Step 1: Build the carousel.** Create
      `src/components/wrap/PhotoCarousel.tsx`:

```tsx
import { memo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { RADIUS, SPACING } from '@/constants/spacing';
import { Icon, PressableScale } from '@/components/ui';
import { themedStyles } from '@/theme';

// Five 4:5 frames, centre-locked, with the next one peeking past the edge.
//
// The ratio is fixed rather than free because every surface downstream — the
// wrap grid, a shared_wrap card's top_photos, the recap — inherits whatever
// shape lands here. Allow mixed ratios and each of those has to decide how to
// crop, independently, later.
const GAP = SPACING[3];

export const PhotoCarousel = memo(function PhotoCarousel({
  uris,
  index,
  onIndexChange,
  onPick,
}: {
  uris: (string | null)[];
  index: number;
  onIndexChange: (i: number) => void;
  onPick: (i: number) => void;
}) {
  const { width } = useWindowDimensions();
  // The frame is 4:5, sized so a slice of the next one stays on screen. 0.62 is
  // a layout number, not a token — it is "wide enough to be the subject, narrow
  // enough that the neighbour reads as swipeable".
  const W = Math.round(width * 0.62);
  const H = Math.round(W * 1.25);
  const STRIDE = W + GAP;
  const REST = (width - W) / 2;

  const tx = useSharedValue(0);
  const start = useSharedValue(0);

  const pan = Gesture.Pan()
    .onBegin(() => {
      start.value = tx.value;
    })
    .onUpdate((e) => {
      tx.value = start.value + e.translationX;
    })
    .onEnd((e) => {
      const moved = -(tx.value - start.value);
      const flung = Math.abs(moved) > W * 0.25 || Math.abs(e.velocityX) > 600;
      const dir = moved > 0 ? 1 : -1;
      const nextIndex = Math.max(
        0,
        Math.min(uris.length - 1, index + (flung ? dir : 0))
      );
      tx.value = withSpring(-nextIndex * STRIDE, {
        damping: 18,
        stiffness: 160,
      });
      if (nextIndex !== index) runOnJS(onIndexChange)(nextIndex);
    });

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value + REST }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.track, trackStyle, { gap: GAP }]}>
        {uris.map((uri, i) => (
          <PressableScale
            key={i}
            scaleTo={0.98}
            onPress={() => (i === index ? onPick(i) : onIndexChange(i))}
            style={[
              styles.slide,
              { width: W, height: H },
              i !== index && styles.slideOff,
            ]}
            accessibilityRole="button"
            accessibilityLabel={uri ? `Photo ${i + 1}` : `Add photo ${i + 1}`}
          >
            {uri ? (
              <Image source={{ uri }} style={styles.img} contentFit="cover" />
            ) : (
              <View style={styles.empty}>
                <Icon name="galleryAdd" size={30} color={COLORS.primary} />
              </View>
            )}
          </PressableScale>
        ))}
      </Animated.View>
    </GestureDetector>
  );
});

const styles = themedStyles(() => ({
  track: { flexDirection: 'row', alignItems: 'center' },
  slide: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  slideOff: { opacity: 0.45 },
  img: { width: '100%', height: '100%' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
}));
```

- [ ] **Step 2: Register the icon.** In `Icon.tsx`'s `SOLAR` map:

```ts
  galleryAdd: 'GalleryAdd',
```

- [ ] **Step 3: Use it in the step.** In `StepPhotos.tsx`, replace the grid with
      `<PhotoCarousel />`, holding `index` in `wrapFlowStore` (not `useState` —
      Global Constraints) and calling the existing picker from `onPick`. Cap the
      picked array at 5.

- [ ] **Step 4: Verify** on device: five frames, next one peeking, drag snaps,
      tapping the centre opens the picker, tapping a neighbour centres it, and
      the flow will not advance with zero photos.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/components/wrap/PhotoCarousel.tsx src/components/ui/Icon.tsx \
        src/components/wrap/flow/steps/StepPhotos.tsx
git commit -m "feat(wrap): photos as a centred 4:5 carousel"
```

---

### Task 2: The note button onto the person's card

**Files:**
- Modify: `src/components/wrap/RateCard.tsx`

**Interfaces:**
- Produces: `RateCard` gains `onLeaveNote?: () => void`.

`RateCard` is **already full-bleed** — `photoArea: { flex: 1 }`, `photo` at
100%×100% (`RateCard.tsx:138`). This task adds the note affordance *onto* that
photo; it does not restructure the card.

- [ ] **Step 1: Add the prop and the button.** Inside the card, below the meta
      block, in `onPhoto` glass:

```tsx
      {onLeaveNote ? (
        <Glass tier="onPhoto" radius={RADIUS.lg} style={styles.noteBtn}>
          <PressableScale
            scaleTo={0.97}
            onPress={onLeaveNote}
            style={styles.noteInner}
            accessibilityRole="button"
            accessibilityLabel={`Leave a note for ${attendee.name}`}
          >
            <Icon name="penNewSquare" size={16} color={COLORS.white} />
            <Text style={styles.noteText}>Leave a note</Text>
          </PressableScale>
        </Glass>
      ) : null}
```

  A thumb reaching a card reaches its bottom, which is why this lives here
  rather than in a header. `onPhoto` and not `panel`: a white chip on a portrait
  punches a hole in the face.

- [ ] **Step 2: Register the icon** — `penNewSquare: 'PenNewSquare'` in `SOLAR`.

- [ ] **Step 3: Add styles**

```tsx
  noteBtn: { position: 'absolute', left: SPACING[3], right: SPACING[3], bottom: SPACING[3] },
  noteInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2],
    paddingVertical: SPACING[2.5],
  },
  noteText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.white,
  },
```

- [ ] **Step 4: Wire it** in `StepRate.tsx` — `onLeaveNote` opens the existing
      `NoteComposer`. **Stop the press propagating to the card's own
      `onPress`**, which opens the profile; without that, tapping the note
      button navigates away mid-deck.

- [ ] **Step 5: Verify** on device, including a very dark and a very bright
      photo — the label must stay legible on both. That is the entire reason for
      the dark tier.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/components/wrap/RateCard.tsx src/components/ui/Icon.tsx \
        src/components/wrap/flow/steps/StepRate.tsx
git commit -m "feat(wrap): leave a note from the card itself"
```

---

### Task 3: Skip, above 15 people

**Files:**
- Modify: `src/components/wrap/flow/steps/StepRate.tsx`

**Interfaces:**
- Produces: none.

- [ ] **Step 1: Add the constant and the control.** At module scope in
      `StepRate.tsx`:

```tsx
// Above this many people the deck stops being a nice review of the night and
// starts being a chore.
//
// The flow is mandatory to unlock the wrap, and a chore standing in front of a
// gate gets RUSHED — people thumbs-up everyone to get through. A rushed rating
// is worse than a skipped one, because it looks like signal. So the escape is
// offered rather than the deck shortened.
//
// 15 is a judgement call, not a measurement.
const SKIP_ABOVE = 15;
```

  Render a tertiary "Skip the rest" only when
  `(status?.coAttendeeCount ?? 0) + 1 > SKIP_ABOVE`. Skipping advances the flow
  and **still completes it** — it does not block the contributor marker.

- [ ] **Step 2: Verify** on a small event (no Skip) and a >15 event (Skip
      present, advances, and finishing still marks you a contributor).

- [ ] **Step 3: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/components/wrap/flow/steps/StepRate.tsx
git commit -m "feat(wrap): a way out of a twenty-person deck"
```

---

### Task 4: Thumbs-down reasons — optional, and split by kind

**Files:**
- Create: `src/utils/wrapRating.ts`
- Test: `src/utils/__tests__/wrapRating.test.ts`
- Create: `src/components/wrap/ReasonChips.tsx`
- Modify: `src/services/wrap.service.ts`, `StepRate.tsx`,
  `app/events/wrap/rate/[eventId].tsx` (the copy at :162)

**Interfaces:**
- Produces:
  - `type DownReason = 'uncomfortable' | 'no_show' | 'not_my_vibe'`
  - `isSafetyReason(r: DownReason): boolean`
  - `reportAttendee({ eventId, reporterId, reportedId, reason }) => Promise<void>`
  - `<ReasonChips onPick={(r: DownReason | null) => void} />`

**The rating saves on swipe; the reason never blocks.** The flow is mandatory to
unlock the wrap — if a 👎 costs a required modal while a 👍 costs nothing, you
have priced honesty, and people racing to unlock will thumbs-up everyone. That
would produce cleaner-looking data that is less true.

- [ ] **Step 1: Write the failing test.** Create
      `src/utils/__tests__/wrapRating.test.ts`:

```ts
import { isSafetyReason, DOWN_REASONS } from '../wrapRating';

describe('isSafetyReason', () => {
  it('treats discomfort as a safety signal', () => {
    expect(isSafetyReason('uncomfortable')).toBe(true);
  });

  it('treats a no-show as a safety signal', () => {
    expect(isSafetyReason('no_show')).toBe(true);
  });

  it('treats taste as a preference, not a report', () => {
    expect(isSafetyReason('not_my_vibe')).toBe(false);
  });

  it('offers exactly three reasons', () => {
    expect(DOWN_REASONS).toHaveLength(3);
  });

  it('every reason is classified', () => {
    for (const r of DOWN_REASONS) {
      expect(typeof isSafetyReason(r.id)).toBe('boolean');
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/utils/__tests__/wrapRating.test.ts --forceExit`
Expected: FAIL — `Cannot find module '../wrapRating'`.

- [ ] **Step 3: Write it.** Create `src/utils/wrapRating.ts`:

```ts
// Why someone was thumbed down — offered after the rating has already saved,
// and never required.
//
// Two kinds of statement share one chip row, and they must NOT share a
// destination. "Made me uncomfortable" is a safety signal and files a real
// report; "not my vibe" is taste and is recorded nowhere. Collecting the first
// and routing it nowhere is worse than never asking.
export type DownReason = 'uncomfortable' | 'no_show' | 'not_my_vibe';

export const DOWN_REASONS: { id: DownReason; label: string }[] = [
  { id: 'uncomfortable', label: 'Made me uncomfortable' },
  { id: 'no_show', label: 'No-show' },
  { id: 'not_my_vibe', label: 'Not my vibe' },
];

// Safety reasons write a `reports` row (migration 014). Preferences do not.
export function isSafetyReason(reason: DownReason): boolean {
  return reason === 'uncomfortable' || reason === 'no_show';
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest src/utils/__tests__/wrapRating.test.ts --forceExit`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the service call.** In `wrap.service.ts`:

```ts
// A safety-flagged thumbs-down. Writes the app's ordinary `reports` row
// (migration 014_blocks_and_reports) — moderation already reads that table
// out-of-band with the service role, so this needs no new pipeline.
export async function reportAttendee(args: {
  eventId: string;
  reporterId: string;
  reportedId: string;
  reason: DownReason;
}): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: args.reporterId,
    reported_id: args.reportedId,
    reason: `wrap_rating:${args.reason}`,
    details: `event:${args.eventId}`,
  });

  if (error) throw error;
}
```

  The `wrap_rating:` prefix keeps these separable from profile reports in the
  moderation queue, which is a different judgement with different urgency.

- [ ] **Step 6: Build the chip row.** Create
      `src/components/wrap/ReasonChips.tsx` — a row of `DOWN_REASONS` plus a
      "Skip", each a `PressableScale` pill. `onPick(null)` for Skip. Above it,
      the line "Anything we should know?"; below it, in caption size:
      "Your thumbs-down is already saved."

- [ ] **Step 7: Wire it into the deck.** In `StepRate.tsx`, on a left swipe:
      commit the rating **first** (existing `rate.mutate`), then show
      `<ReasonChips />`. On pick: if `isSafetyReason(r)` call `reportAttendee`;
      otherwise do nothing. Either way advance the deck.

- [ ] **Step 8: Fix the copy that is now false.** The rate screen's subtitle
      (`app/events/wrap/rate/[eventId].tsx:162`) and `CompleteMoment`'s "Thumbs
      down stay between you and no one" (:174) both promise privacy that a
      report breaks. Replace with:

```
Right up · left down · only you see your ratings
```

  and

```
Thumbs up land on their profile. Thumbs down never do.
```

  **Copy that promises privacy the schema does not provide is worse than no
  copy** — this is the second time in this project that trap has appeared.

- [ ] **Step 9: Typecheck, test, lint, commit**

```bash
npm run typecheck && npm test && npm run lint
git add src/utils/wrapRating.ts src/utils/__tests__/wrapRating.test.ts \
        src/components/wrap/ReasonChips.tsx src/services/wrap.service.ts \
        src/components/wrap/flow/steps/StepRate.tsx "app/events/wrap/rate/[eventId].tsx"
git commit -m "feat(wrap): an optional reason for a thumbs-down, split by kind"
```

---

### Task 5: Rewind you have to hold

**Files:**
- Create: `src/components/wrap/HoldToConfirm.tsx`
- Modify: `src/components/wrap/flow/steps/StepRewind.tsx`

**Interfaces:**
- Produces:
  `<HoldToConfirm durationMs={number} onComplete={() => void} children={ReactNode} />`

Spec §5.4. Rewind is **public** — `encore_requests_select` is
`USING (is_event_attendee(...))` (`032_wrap.sql:464`) — so the effort is
proportionate to a claim other people will read. A hold cannot happen by
accident.

- [ ] **Step 1: Build the hold.** Create `src/components/wrap/HoldToConfirm.tsx`
      with a `Gesture.LongPress`-free implementation: a `Gesture.Pan().minDistance(0)`
      or `Gesture.Tap()` pair is fragile here, so drive it from `onTouchStart` /
      `onTouchEnd` on a `Pressable` with a Reanimated `withTiming` progress
      value:

```tsx
  const progress = useSharedValue(0);

  const begin = () => {
    haptic('threshold');
    progress.value = withTiming(1, { duration: durationMs }, (done) => {
      if (done) runOnJS(finish)();
    });
  };

  const cancel = () => {
    // Drains rather than snapping: releasing early should feel like letting go
    // of something, not like a reset.
    progress.value = withTiming(0, { duration: 220 });
  };
```

  `finish` fires `haptic('save')` then `onComplete()`. Render an SVG ring driven
  by `progress` and a coral flood layer whose opacity follows it.

  **Use `haptic()` from `dealtCardGeometry.ts`** — one vocabulary, per Global
  Constraints. `threshold` on start, `save` on completion.

- [ ] **Step 2: Use it in the step.** Wrap the rewind glyph in `<HoldToConfirm
      durationMs={1200} onComplete={() => encore.mutate(true)}>`. Keep the tertiary
      "Skip".

- [ ] **Step 3: Fork the success copy by role** (spec §5.4):

```tsx
  const done = status?.encoreRequested;
  const line = isHost
    ? 'Everyone who came will know you want to run it back.'
    : `You and ${Math.max(0, (status?.encoreCount ?? 1) - 1)} others want to run it back. ${hostName} has been told.`;
```

  Keep the live count visible **before** the hold too — that count is what makes
  holding feel worth it.

- [ ] **Step 4: Leave the Lottie hook.** Add a comment where the flood renders:

```tsx
        {/* Lottie L2 goes here — scrubbed by `progress`, not autoplayed. See
            docs/superpowers/specs/2026-08-07-wrap-lottie-manifest.md. Until the
            asset exists this is a colour flood, which is honest but flat. */}
```

- [ ] **Step 5: Verify** on device: holding fills the ring in ~1.2s; releasing
      early drains; completing writes the encore and bumps the count; Skip
      writes nothing; both haptics fire on a physical device (they are no-ops in
      a simulator).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/components/wrap/HoldToConfirm.tsx src/components/wrap/flow/steps/StepRewind.tsx
git commit -m "feat(wrap): rewind asks you to hold it"
```

---

### Task 6: The device test sheet

**Files:**
- Create: `docs/testing/wrap-flow-phase-2b.md`

- [ ] **Step 1: Write the sheet**

```markdown
# Wrap flow interactions (Phase 2b) — device sheet

Phases 1 and 2a must be in. ⚠️ rows check reasoning, not an observed bug.

## 1. Thumbs-down reasons (highest risk — this one writes to moderation)
| | iOS | Android |
|---|---|---|
| ⚠️ Swiping left saves the rating **before** any chip is touched | | |
| ⚠️ Skipping the chips still advances and still completes the flow | | |
| ⚠️ "Made me uncomfortable" writes a `reports` row with a `wrap_rating:` prefix | | |
| ⚠️ "Not my vibe" writes **no** report | | |
| No screen claims thumbs-down is private any more | | |

## 2. The hold
| | iOS | Android |
|---|---|---|
| Ring fills in about 1.2s | | |
| ⚠️ Releasing at 80% drains rather than snapping to zero | | |
| ⚠️ Dragging the finger off the glyph cancels cleanly | | |
| Haptic on start and on completion (physical device only) | | |
| Count before the hold matches the hub's tally | | |
| ⚠️ Guest and host see different success copy | | |

## 3. Carousel
| | iOS | Android |
|---|---|---|
| Five frames; next one visibly peeking | | |
| ⚠️ Every frame is 4:5 regardless of the source photo's shape | | |
| Drag snaps to the nearest frame; a flick advances one | | |
| ⚠️ A very wide and a very tall photo both fill without distorting | | |

## 4. Note on the card
| | iOS | Android |
|---|---|---|
| ⚠️ Legible on a very dark photo **and** a very bright one | | |
| ⚠️ Tapping it does not open the profile behind it | | |
| Composer opens over the deck and returns to the same card | | |

## 5. Skip
| | iOS | Android |
|---|---|---|
| Absent at 6 people, present above 15 | | |
| ⚠️ Skipping still marks you a contributor | | |

## 6. Android-specific
| | Android |
|---|---|
| ⚠️ `onPhoto` glass legible with no backdrop blur (flat fill path) | |
| ⚠️ Carousel pan does not fight the flow's own gestures | |
| ⚠️ Hold gesture survives a scroll starting on the glyph | |
```

- [ ] **Step 2: Commit**

```bash
git add docs/testing/wrap-flow-phase-2b.md
git commit -m "docs(wrap): device sheet for the flow's interactions"
```

---

## Verification

- `npm run typecheck` → 0
- `npm test` → green (5 new in `wrapRating.test.ts`; Phase 1's 10 and 2a's 9 still pass)
- `npm run lint` → 0 errors, no new warnings
- No screen describes thumbs-down or rewind as private
- The device sheet is filled in, or its gaps stated plainly

## What can break silently

1. **A reason chip made mandatory.** The gate would price honesty and everyone
   would thumbs-up to get through — cleaner data, less true.
2. **`not_my_vibe` routed to `reports`.** Taste would enter a moderation queue
   as if it were a safety concern.
3. **The rating committed *after* the chips instead of before.** Dismissing the
   row would silently drop the rating.
4. **A prop added to a step.** `memo` stops holding and the deck drops frames.
   `PhotoCarousel`, `RateCard`, `ReasonChips` and `HoldToConfirm` take props —
   **steps** do not.
5. **Direct `expo-haptics` calls.** A third haptic vocabulary that drifts from
   the two already agreed in `dealtCardGeometry.ts`.

## Out of scope

Phase 3: the launch dealt card and the turn, the chat pin, Home variants.
