# Event Sheet Description Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `EventBottomSheet`'s unclamped description with a dynamically-clamped, line-by-line scroll reveal, pin the primary CTA as a persistent footer so it never moves, and make the full-screen hero a device-width square instead of an anchor-derived height — without touching any other part of the sheet's existing flow.

**Architecture:** A pure line-count helper (`utils/textLines.ts`) decides how many description lines fit above the pinned footer; a generalized entrance hook (`useEnterOnScroll`, extracted from the existing `useRowEntrance`) drives both the who's-going rows (already shipped, unchanged behavior) and the new hidden description lines off the same "position triggers it, time completes it" model; a new `RevealingText` component owns the measure-then-reveal mechanics; the primary action moves from inline content into `BottomSheetFooter` (the same mechanism already used for the wishlist toast); hero sizing drops its who's-going-anchor dependency for a flat `screenWidth` square.

**Tech Stack:** React Native, `@gorhom/bottom-sheet` v5, `react-native-reanimated` v4 (worklets/shared values — no Jest coverage possible for anything using them; see Global Constraints), Jest for pure-function tests.

## Global Constraints

- Full spec: `docs/superpowers/specs/2026-07-24-event-sheet-description-reveal-design.md`. Every task below implements a section of it — do not deviate from its decisions (square hero, pinned footer, dynamic clamp, banner reorder) without checking back with the user.
- `npm run typecheck` must stay at 0 errors after every task.
- `npm test` must stay green after every task.
- `npm run lint` — 95 errors / 16 warnings are pre-existing; don't add to that count.
- Nothing else about the sheet changes: not the two-stop drag, not `BANNER_H` (232), not the frosted-glass tiers, not the attendee hand-off animation, not spacing/type values anywhere untouched by this spec. If a task's diff touches a line outside its stated purpose, that's a mistake — revert it.
- Reanimated 4 throws on import under Jest (see `AGENTS.md`) — no component test exists or will be added for `EventBottomSheet.tsx`, `RevealingText.tsx`, or `useEnterOnScroll.ts`. Only `utils/textLines.ts` (a plain function) gets a Jest test. Everything else is a manual device pass (Task 8) — Android specifically, since this file's own history flags elevation/shadow-clipping differences there.
- All file paths below are relative to the repo root (`/Users/f4mgmarketing/Desktop/Mello-App/mello`).

---

### Task 1: Pure line-fit helper

**Files:**
- Create: `src/utils/textLines.ts`
- Test: `src/utils/__tests__/textLines.test.ts`

**Interfaces:**
- Produces: `clampVisibleLineCount(availableHeight: number, lineHeight: number, totalLines: number): number` — later tasks (Task 3, Task 7) call this to decide the description's initial visible line count.

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/__tests__/textLines.test.ts
import { clampVisibleLineCount } from '../textLines';

describe('clampVisibleLineCount', () => {
  it('returns the full count when everything fits', () => {
    expect(clampVisibleLineCount(200, 21, 5)).toBe(5);
  });

  it('floors to whole lines that fit the available height', () => {
    expect(clampVisibleLineCount(100, 21, 10)).toBe(4); // 100 / 21 = 4.76
  });

  it('never returns fewer than 1 line when there is at least one line and some room', () => {
    expect(clampVisibleLineCount(5, 21, 10)).toBe(1);
  });

  it('never exceeds the total line count', () => {
    expect(clampVisibleLineCount(1000, 21, 3)).toBe(3);
  });

  it('returns 0 when there are no lines to show', () => {
    expect(clampVisibleLineCount(200, 21, 0)).toBe(0);
  });

  it('returns 0 when available height is zero or negative', () => {
    expect(clampVisibleLineCount(0, 21, 5)).toBe(0);
    expect(clampVisibleLineCount(-40, 21, 5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/utils/__tests__/textLines.test.ts`
Expected: FAIL — `Cannot find module '../textLines'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/utils/textLines.ts

// How many of a text block's measured lines fit in the vertical space above
// a fixed boundary (the event sheet's pinned CTA footer, in practice).
// Floors rather than rounds — a partially-visible line reads as a rendering
// bug, not as "there's more below."
export function clampVisibleLineCount(
  availableHeight: number,
  lineHeight: number,
  totalLines: number
): number {
  if (totalLines <= 0 || lineHeight <= 0 || availableHeight <= 0) return 0;
  const fits = Math.floor(availableHeight / lineHeight);
  return Math.max(1, Math.min(fits, totalLines));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/utils/__tests__/textLines.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/textLines.ts src/utils/__tests__/textLines.test.ts
git commit -m "feat(events): add clampVisibleLineCount for the description reveal"
```

---

### Task 2: Generalize the row-entrance hook

**Files:**
- Create: `src/components/events/useEnterOnScroll.ts`
- Modify: `src/components/events/EventBottomSheet.tsx:266-339` (delete `useRowEntrance`), `:378-385` (`GoingRow`'s call site), `:459-466` (`GoingStack`'s call site)

**Interfaces:**
- Consumes: nothing new — `@gorhom/bottom-sheet`'s `useBottomSheetInternal`, `react-native-reanimated`'s `useSharedValue`/`useDerivedValue`/`useAnimatedReaction`/`withTiming`/`interpolate`/`Extrapolation`/`Easing`, already imported in `EventBottomSheet.tsx`.
- Produces: `useEnterOnScroll(opts): SharedValue<number>` where
  `opts = { offset: number; slide: number; sheetProgress: SharedValue<number>; boundary: number; y: number | null; h: number | null; durationMs?: number }`.
  Task 3 (`RevealingText`) and this task's own `GoingRow`/`GoingStack` call sites both depend on this exact signature.

This is a pure extraction — `GoingRow`/`GoingStack`'s visible behavior must not change. `useRowEntrance`'s body computed
`top = animatedPosition.value + BANNER_H + slide + cardOffset + y - contentOffsetY`, then `arrived = top < screenH`.
`BANNER_H` and `cardOffset` collapse into one `offset` parameter; `screenH` becomes the generic `boundary` parameter — callers that want today's behavior just pass `boundary: screenH` and `offset: BANNER_H + cardOffset`.

- [ ] **Step 1: Create the shared hook**

```ts
// src/components/events/useEnterOnScroll.ts
import {
  useSharedValue,
  useDerivedValue,
  useAnimatedReaction,
  withTiming,
  interpolate,
  Extrapolation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { useBottomSheetInternal } from '@gorhom/bottom-sheet';

// Drives a one-shot 0->1 entrance the instant an element clears a
// screen-space boundary, then times it to completion — position decides
// WHEN, a fixed duration decides HOW LONG.
//
// Keying this to the sheet's own snap progress instead fires everything
// below the fold before it's ever seen; scrubbing progress directly from
// live position instead freezes anything straddling the boundary mid-slide,
// half-arrived. Both were tried on the who's-going rows this was extracted
// from — see EventBottomSheet.tsx's GoingRow for the fuller account.
//
// Generic over what "arrived" means: who's-going rows arrive at the screen's
// bottom edge (`boundary: screenH`); description lines arrive at the pinned
// CTA footer's top edge instead, so they read as emerging from behind it
// rather than from the bottom of the screen.
export function useEnterOnScroll({
  offset,
  slide,
  sheetProgress,
  boundary,
  y,
  h,
  durationMs = 420,
}: {
  // Fixed vertical offset from the sheet's own top to this element's
  // container — e.g. BANNER_H + the going card's y, or BANNER_H + the
  // description block's y.
  offset: number;
  // How far this element's container slides as `sheetProgress` runs 0->1
  // (the content card's translateY range — `heroGrow` in EventBottomSheet).
  slide: number;
  sheetProgress: SharedValue<number>;
  // Screen-space y beyond which the element counts as arrived.
  boundary: number;
  // This element's own layout position within its offset container —
  // null until the caller has measured it via onLayout.
  y: number | null;
  h: number | null;
  durationMs?: number;
}): SharedValue<number> {
  const { animatedPosition, animatedScrollableState } = useBottomSheetInternal();
  const played = useSharedValue(0);

  const arrived = useDerivedValue(() => {
    if (y == null || h == null) return false;
    const slideNow = interpolate(
      sheetProgress.value,
      [0, 1],
      [0, slide],
      Extrapolation.CLAMP
    );
    const top =
      animatedPosition.value +
      offset +
      slideNow +
      y -
      animatedScrollableState.value.contentOffsetY;
    return top < boundary;
  });

  useAnimatedReaction(
    () => arrived.value,
    (isArrived) => {
      // `=== 0` rather than `< 1` so a run already underway is never
      // restarted mid-flight by a frame that re-reads as arrived.
      if (isArrived && played.value === 0) {
        played.value = withTiming(1, {
          duration: durationMs,
          easing: Easing.out(Easing.cubic),
        });
      }
    }
  );

  return played;
}
```

- [ ] **Step 2: Delete `useRowEntrance` from `EventBottomSheet.tsx`**

Delete the entire block at `EventBottomSheet.tsx:266-339` (the comment block starting `// A row's entrance: 0 before it arrives...` through the end of the `useRowEntrance` function).

Add the import at the top of the file, alongside the other local imports:

```ts
import { useEnterOnScroll } from './useEnterOnScroll';
```

- [ ] **Step 3: Update `GoingRow`'s call site**

Find (around what was line 378):

```ts
  const entrance = useRowEntrance({
    cardOffset,
    heroGrow,
    sheetProgress,
    screenH,
    y: box?.y ?? null,
    h: box?.h ?? null,
  });
```

Replace with:

```ts
  const entrance = useEnterOnScroll({
    offset: BANNER_H + cardOffset,
    slide: heroGrow,
    sheetProgress,
    boundary: screenH,
    y: box?.y ?? null,
    h: box?.h ?? null,
  });
```

- [ ] **Step 4: Update `GoingStack`'s call site**

Same replacement as Step 3, in `GoingStack` (around what was line 459) — identical shape:

```ts
  const entrance = useEnterOnScroll({
    offset: BANNER_H + cardOffset,
    slide: heroGrow,
    sheetProgress,
    boundary: screenH,
    y: box?.y ?? null,
    h: box?.h ?? null,
  });
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors. If `useRowEntrance` is referenced anywhere else (it shouldn't be — it was module-private to this file), fix those call sites too before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/components/events/useEnterOnScroll.ts src/components/events/EventBottomSheet.tsx
git commit -m "refactor(events): extract useEnterOnScroll from GoingRow's entrance"
```

---

### Task 3: `RevealingText` component

**Files:**
- Create: `src/components/events/RevealingText.tsx`

**Interfaces:**
- Consumes: `useEnterOnScroll` from Task 2, `clampVisibleLineCount` from Task 1.
- Produces:
  ```ts
  function RevealingText(props: {
    text: string;
    style: TextStyle;
    availableHeight: number;
    offset: number;
    heroGrow: number;
    sheetProgress: SharedValue<number>;
    footerBoundary: number;
    onLayout?: (e: LayoutChangeEvent) => void;
  }): JSX.Element
  ```
  Task 7 wires this in as the description's replacement, passing `offset = BANNER_H + descriptionY`, `footerBoundary` = the pinned footer's measured top edge on screen.

Built standalone in this task (not yet wired into `EventBottomSheet.tsx` — that's Task 7), so it can be sanity-checked in isolation first.

- [ ] **Step 1: Write the component**

```tsx
// src/components/events/RevealingText.tsx
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
  type TextStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { useEnterOnScroll } from './useEnterOnScroll';
import { clampVisibleLineCount } from '@/utils/textLines';

// A block of text that shows only as many lines as fit above a fixed
// boundary, then reveals the rest one line at a time — Fade + Rise, same
// motion `GoingRow` uses — the instant each hidden line clears that boundary
// on scroll. Built for the event sheet's description, where the boundary is
// the pinned CTA footer's top edge, so extra lines read as emerging from
// behind it rather than from the bottom of the screen.
//
// RN lays a `Text` out as one block, so line-splitting needs a real measure:
// a hidden copy of the FULL text (opacity 0, absolutely positioned so it
// doesn't affect layout) is measured via `onTextLayout`, which gives both
// the per-line substrings and the line height. The visible lines are then
// plain, separately-laid-out `Text` elements — real in-flow content, so the
// block's rendered height legitimately grows as more of them appear.
export function RevealingText({
  text,
  style,
  availableHeight,
  offset,
  heroGrow,
  sheetProgress,
  footerBoundary,
  onLayout,
}: {
  text: string;
  style: TextStyle;
  // Vertical space above the boundary available to the initially-visible
  // lines — the caller derives this from its own layout (see
  // EventBottomSheet.tsx's description clamp calc in Task 7).
  availableHeight: number;
  offset: number;
  heroGrow: number;
  sheetProgress: SharedValue<number>;
  footerBoundary: number;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [lineHeight, setLineHeight] = useState<number | null>(null);

  const handleTextLayout = useCallback(
    (e: NativeSyntheticEvent<TextLayoutEventData>) => {
      const measured = e.nativeEvent.lines;
      if (measured.length === 0) return;
      const next = measured.map((l) => l.text);
      setLines((prev) =>
        prev && prev.length === next.length && prev.every((t, i) => t === next[i])
          ? prev
          : next
      );
      setLineHeight((prev) => (prev === measured[0].height ? prev : measured[0].height));
    },
    []
  );

  const visibleCount =
    lines && lineHeight != null
      ? clampVisibleLineCount(availableHeight, lineHeight, lines.length)
      : null;

  return (
    <View onLayout={onLayout}>
      <Text
        style={[style, styles.measuring]}
        onTextLayout={handleTextLayout}
        pointerEvents="none"
      >
        {text}
      </Text>

      {/* Nothing renders until the measure pass completes — one frame of
          "no description" reads better than one frame of the wrong amount
          of it. */}
      {lines && visibleCount != null && (
        <View>
          {lines.slice(0, visibleCount).map((line, i) => {
            const truncated = visibleCount < lines.length && i === visibleCount - 1;
            return (
              <Text key={i} style={style} numberOfLines={1} ellipsizeMode="tail">
                {truncated ? `${line.trimEnd()}…` : line}
              </Text>
            );
          })}
          {lines.slice(visibleCount).map((line, i) => (
            <RevealingLine
              key={visibleCount + i}
              text={line}
              style={style}
              offset={offset}
              heroGrow={heroGrow}
              sheetProgress={sheetProgress}
              footerBoundary={footerBoundary}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// One hidden-then-revealed line. Needs its own onLayout — a position shared
// across the whole hidden block would fire every line's entrance at once
// instead of one at a time as the user scrolls.
function RevealingLine({
  text,
  style,
  offset,
  heroGrow,
  sheetProgress,
  footerBoundary,
}: {
  text: string;
  style: TextStyle;
  offset: number;
  heroGrow: number;
  sheetProgress: SharedValue<number>;
  footerBoundary: number;
}) {
  const [box, setBox] = useState<{ y: number; h: number } | null>(null);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { y, height: h } = e.nativeEvent.layout;
    setBox((prev) => (prev?.y === y && prev?.h === h ? prev : { y, h }));
  }, []);

  const entrance = useEnterOnScroll({
    offset,
    slide: heroGrow,
    sheetProgress,
    boundary: footerBoundary,
    y: box?.y ?? null,
    h: box?.h ?? null,
  });

  const lineStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: interpolate(entrance.value, [0, 1], [8, 0], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <Animated.View onLayout={handleLayout} style={lineStyle}>
      <Text style={style}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  measuring: { position: 'absolute', left: 0, right: 0, opacity: 0 },
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors. This file isn't imported anywhere yet, so this just confirms it's internally well-typed.

- [ ] **Step 3: Commit**

```bash
git add src/components/events/RevealingText.tsx
git commit -m "feat(events): add RevealingText, a scroll-triggered line-by-line reveal"
```

---

### Task 4: Square hero, remove anchor-derived sizing

**Files:**
- Modify: `src/components/events/EventBottomSheet.tsx:140-164` (constants), `:516-574` (hero sizing block), `:646-718` (`recomputeSnaps` and its layout callbacks), `:1414-1513` (going-card render — drop the anchor `onLayout` prop)

**Interfaces:**
- Consumes: `useWindowDimensions()`'s `width` (already destructured at line 514).
- Produces: `heroGrow: number`, `photoRenderH: number` — same names, same call sites elsewhere in the file (`cardRevealStyle`, the `heroPhoto` view's `height`), unchanged from a consumer's point of view.

- [ ] **Step 1: Remove the retired constant**

Delete `HERO_OVERSHOOT` and its comment block at lines 153-164 (`// How far the hero is allowed to grow PAST...` through `const HERO_OVERSHOOT = 0;`).

- [ ] **Step 2: Replace the hero-sizing block**

Find (around lines 516-574, from `const [firstSnapPx, setFirstSnapPx] = useState...` through `const contentPadBottom = ...`):

```ts
  const [firstSnapPx, setFirstSnapPx] = useState<number | null>(null);
  const [goingAnchorPx, setGoingAnchorPx] = useState<number | null>(null);
  const first = firstSnapPx ?? Math.round(height * 0.46);

  const climb = height - first;
  const goingRestBottom = height - insets.bottom - SPACING[3];
  const heroGrow = Math.max(
    0,
    Math.min(
      goingRestBottom -
        (goingAnchorPx ?? Math.round(height * 0.46)) -
        BANNER_H +
        HERO_OVERSHOOT,
      climb
    )
  );
  const photoRenderH = BANNER_H + heroGrow;

  const contentPadBottom = insets.bottom + SPACING[8] + heroGrow;
```

Replace with:

```ts
  const [firstSnapPx, setFirstSnapPx] = useState<number | null>(null);
  const first = firstSnapPx ?? Math.round(height * 0.46);

  // The sheet's climb, resting stop -> y=0 — the whole budget for the leg.
  const climb = height - first;
  // The hero at the full stop: a square, `screenWidth` tall. Dynamic per
  // device by construction (it's a function of width, nothing else) and no
  // longer a function of title length, description length, or attendee
  // count — see docs/superpowers/specs/2026-07-24-event-sheet-description-reveal-design.md
  // §1 for why the old who's-going-anchor math is gone. Clamped to the climb
  // so the slide can never exceed the sheet's own drag distance.
  const heroGrow = Math.max(0, Math.min(width - BANNER_H, climb));
  const photoRenderH = BANNER_H + heroGrow;

  const contentPadBottom = insets.bottom + SPACING[8] + heroGrow;
```

- [ ] **Step 3: Simplify `recomputeSnaps` and its layout refs**

Find (around lines 645-718, from `const actionsYRef = useRef...` through the end of `onGoingCardLayout`):

```ts
  const actionsYRef = useRef<number | null>(null);
  const primaryBottomRef = useRef<number | null>(null);
  const goingCardYRef = useRef<number | null>(null);
  const goingAnchorBottomRef = useRef<number | null>(null);
  const [goingCardOffset, setGoingCardOffset] = useState(0);
  const recomputeSnaps = useCallback(() => {
    const a = actionsYRef.current;
    if (a == null) return;
    const p = primaryBottomRef.current;
    if (p != null) {
      const next = Math.round(
        Math.min(BANNER_H + a + p + SPACING[2.5], height * 0.82)
      );
      setFirstSnapPx((prev) => (prev === next ? prev : next));
    }
    const cardY = goingCardYRef.current;
    if (cardY != null) {
      const next = Math.round(a + cardY);
      setGoingCardOffset((prev) => (prev === next ? prev : next));
    }
    const anchorBottom = goingAnchorBottomRef.current;
    if (cardY != null && anchorBottom != null) {
      const next = Math.round(a + cardY + anchorBottom + GOING_CARD_PAD);
      setGoingAnchorPx((prev) => (prev === next ? prev : next));
    }
  }, [height]);
  const onActionsLayout = useCallback(
    (e: LayoutChangeEvent) => {
      actionsYRef.current = e.nativeEvent.layout.y;
      recomputeSnaps();
    },
    [recomputeSnaps]
  );
  const onPrimaryLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { y, height: h } = e.nativeEvent.layout;
      primaryBottomRef.current = y + h;
      recomputeSnaps();
    },
    [recomputeSnaps]
  );
  const onGoingAnchorLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { y, height: h } = e.nativeEvent.layout;
      goingAnchorBottomRef.current = y + h;
      recomputeSnaps();
    },
    [recomputeSnaps]
  );
  const onGoingCardLayout = useCallback(
    (e: LayoutChangeEvent) => {
      goingCardYRef.current = e.nativeEvent.layout.y;
      recomputeSnaps();
    },
    [recomputeSnaps]
  );
```

Replace with (drops the anchor tracking; `primaryBottomRef`/`onPrimaryLayout` also go — Task 5 removes the inline primary button entirely, and Task 5's own step updates `recomputeSnaps` again to add the footer-height term):

```ts
  const actionsYRef = useRef<number | null>(null);
  const goingCardYRef = useRef<number | null>(null);
  const [goingCardOffset, setGoingCardOffset] = useState(0);
  const recomputeSnaps = useCallback(() => {
    const a = actionsYRef.current;
    if (a == null) return;
    const next = Math.round(Math.min(BANNER_H + a + SPACING[2.5], height * 0.82));
    setFirstSnapPx((prev) => (prev === next ? prev : next));
    const cardY = goingCardYRef.current;
    if (cardY != null) {
      const nextOffset = Math.round(a + cardY);
      setGoingCardOffset((prev) => (prev === nextOffset ? prev : nextOffset));
    }
  }, [height]);
  const onActionsLayout = useCallback(
    (e: LayoutChangeEvent) => {
      actionsYRef.current = e.nativeEvent.layout.y;
      recomputeSnaps();
    },
    [recomputeSnaps]
  );
  const onGoingCardLayout = useCallback(
    (e: LayoutChangeEvent) => {
      goingCardYRef.current = e.nativeEvent.layout.y;
      recomputeSnaps();
    },
    [recomputeSnaps]
  );
```

(Task 5 replaces the `firstSnapPx` line above again, to add the footer's own height — this intermediate version is correct for this task in isolation and keeps every task independently buildable.)

- [ ] **Step 4: Drop the anchor `onLayout` prop from the going-card render**

Find, in the member branch (around line 1443):

```tsx
                            onLayout={i === 0 ? onGoingAnchorLayout : undefined}
```

Delete this line (and its preceding comment about "Row 0's bottom edge is the hero's anchor...") — `GoingRow` still accepts an `onLayout` prop (used by nothing now); leave the prop itself in `GoingRow`'s signature alone, just stop passing it here.

Find, in the non-member branch (around line 1509):

```tsx
                      onLayout={onGoingAnchorLayout}
```

Delete this line from the `<GoingStack ... />` call.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors. `onPrimaryLayout` and `primaryBottomRef` are untouched by this task — they're still declared and still used by the still-intact inline primary-button block, so nothing is unused yet. Task 5 removes both, along with that block.

- [ ] **Step 6: Commit**

```bash
git add src/components/events/EventBottomSheet.tsx
git commit -m "feat(events): square hero at full-screen, drop anchor-derived sizing"
```

---

### Task 5: Pin the CTA as a persistent footer

**Files:**
- Modify: `src/components/events/EventBottomSheet.tsx` — several regions:
  - `:645-` `recomputeSnaps` (add footer-height term, from Task 4's version)
  - `:1048-1069` `renderToast` → becomes `renderFooter` (combine with the CTA)
  - `:1097` `footerComponent={renderToast}` → `footerComponent={renderFooter}`
  - `:1283-1376` the `actions` block's primary-button section (remove from inline content)
  - `:1917-1919` `footerRow`/`spotsInfo` styles (reused, not removed)

**Interfaces:**
- Consumes: `Button`, `Icon`, `BottomSheetFooter`, `BottomSheetFooterProps` (all already imported).
- Produces: a `footerHeightRef`/`onFooterLayout` pair and a `CTA_BOTTOM_INSET` constant that Task 7 reuses to compute the description's `footerBoundary`.

This is the biggest single-file task. Work through it region by region; typecheck only needs to pass at the end of the task, not after every step, since some intermediate states remove a call site before its replacement exists.

- [ ] **Step 1: Add the footer-height ref and inset constant**

Near the other layout constants (around where `GOING_CARD_PAD`/`GOING_AVATAR` are defined, line ~199-200), add:

```ts
// The pinned CTA footer's distance from the screen's bottom edge — same
// value BottomSheetFooter's `bottomInset` prop takes, and reused by the
// description reveal (Task 7) to compute the footer's screen-space top edge.
const CTA_BOTTOM_INSET = SPACING[5];
```

- [ ] **Step 2: Update `recomputeSnaps` to reserve the footer's height**

Find the `recomputeSnaps` version from Task 4:

```ts
  const actionsYRef = useRef<number | null>(null);
  const goingCardYRef = useRef<number | null>(null);
  const [goingCardOffset, setGoingCardOffset] = useState(0);
  const recomputeSnaps = useCallback(() => {
    const a = actionsYRef.current;
    if (a == null) return;
    const next = Math.round(Math.min(BANNER_H + a + SPACING[2.5], height * 0.82));
    setFirstSnapPx((prev) => (prev === next ? prev : next));
    const cardY = goingCardYRef.current;
    if (cardY != null) {
      const nextOffset = Math.round(a + cardY);
      setGoingCardOffset((prev) => (prev === nextOffset ? prev : nextOffset));
    }
  }, [height]);
```

Replace with:

```ts
  const actionsYRef = useRef<number | null>(null);
  const goingCardYRef = useRef<number | null>(null);
  const footerHeightRef = useRef<number | null>(null);
  const [goingCardOffset, setGoingCardOffset] = useState(0);
  const recomputeSnaps = useCallback(() => {
    const a = actionsYRef.current;
    const footerH = footerHeightRef.current;
    if (a == null || footerH == null) return;
    // Resting stop: everything above the pinned footer (host row, title,
    // info, pills, the clamped description), plus the footer's own height
    // and inset, plus a small gap so the footer doesn't sit flush against
    // the last visible line.
    const next = Math.round(
      Math.min(
        BANNER_H + a + footerH + CTA_BOTTOM_INSET + SPACING[2.5],
        height * 0.82
      )
    );
    setFirstSnapPx((prev) => (prev === next ? prev : next));
    const cardY = goingCardYRef.current;
    if (cardY != null) {
      const nextOffset = Math.round(a + cardY);
      setGoingCardOffset((prev) => (prev === nextOffset ? prev : nextOffset));
    }
  }, [height]);
  const onFooterLayout = useCallback(
    (e: LayoutChangeEvent) => {
      footerHeightRef.current = e.nativeEvent.layout.height;
      recomputeSnaps();
    },
    [recomputeSnaps]
  );
```

- [ ] **Step 3: Combine the toast and the CTA into one footer render function**

Find (around lines 1048-1069):

```ts
  const renderToast = useCallback(
    (props: BottomSheetFooterProps) =>
      toast ? (
        <BottomSheetFooter {...props} bottomInset={24}>
          <Animated.View
            entering={FadeInUp.duration(200)}
            exiting={FadeOut.duration(160)}
            style={styles.toast}
            pointerEvents="none"
          >
            <Icon
              name="bookmarkFilled"
              size={15}
              color="#fff"
              strokeWidth={2}
            />
            <Text style={styles.toastText}>{toast}</Text>
          </Animated.View>
        </BottomSheetFooter>
      ) : null,
    [toast]
  );
```

Replace with (the primary-action JSX below is moved verbatim out of the `actions` block in Step 4 — same conditions, same components, same handlers, just relocated):

```ts
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) =>
      event ? (
        <BottomSheetFooter {...props} bottomInset={CTA_BOTTOM_INSET}>
          <View style={styles.ctaFooter} onLayout={onFooterLayout}>
            {hasWrapped(event) && (isParticipant || isHost) ? (
              <Button
                label="Open the event wrap"
                onPress={() => {
                  onCloseAll();
                  router.push(`/events/wrap/${event.id}`);
                }}
              />
            ) : !hasWrapped(event) ? (
              isHost ? (
                <Button
                  label="Manage event"
                  onPress={() => {
                    onCloseAll();
                    router.push(`/events/host/${event.id}`);
                  }}
                />
              ) : isParticipant ? (
                <Button
                  label="Open chat"
                  onPress={() => {
                    onCloseAll();
                    router.push(`/(tabs)/chats/${event.id}`);
                  }}
                />
              ) : (
                <View style={styles.footerRow}>
                  {event.max_people != null && (
                    <View style={styles.spotsInfo}>
                      <Text style={styles.spotsCount}>
                        {event.participant_count}/{event.max_people}
                      </Text>
                      <Text style={styles.spotsLeft}>
                        {Math.max(event.max_people - event.participant_count, 0)}{' '}
                        spots left
                      </Text>
                    </View>
                  )}
                  <Button
                    style={{ flex: 1 }}
                    label={
                      isPending
                        ? 'Request pending'
                        : womenOnlyLocked
                          ? 'Female-only event'
                          : isFull
                            ? 'Event full'
                            : tooFar
                              ? 'Join with Mello+'
                              : event.requires_approval
                                ? 'Request to join'
                                : 'Join event'
                    }
                    variant={
                      isPending || isFull || womenOnlyLocked ? 'tertiary' : 'primary'
                    }
                    onPress={() => (isPending ? leave.mutate() : handleJoinPress())}
                    disabled={
                      ((isFull || womenOnlyLocked) && !isPending) ||
                      join.isPending ||
                      leave.isPending
                    }
                  />
                </View>
              )
            ) : null}
          </View>
          {toast && (
            <Animated.View
              entering={FadeInUp.duration(200)}
              exiting={FadeOut.duration(160)}
              style={styles.toast}
              pointerEvents="none"
            >
              <Icon name="bookmarkFilled" size={15} color="#fff" strokeWidth={2} />
              <Text style={styles.toastText}>{toast}</Text>
            </Animated.View>
          )}
        </BottomSheetFooter>
      ) : null,
    [
      event,
      isParticipant,
      isHost,
      isPending,
      isFull,
      womenOnlyLocked,
      tooFar,
      toast,
      onFooterLayout,
      onCloseAll,
      router,
      leave,
      join,
      handleJoinPress,
    ]
  );
```

Update the prop wiring at what was line 1097:

```tsx
      footerComponent={renderToast}
```

becomes:

```tsx
      footerComponent={renderFooter}
```

- [ ] **Step 4: Remove the primary button from the inline `actions` content**

Find (around lines 1302-1376, the whole `{/* Live event: the headline action... */}` block through its closing `)}`):

```tsx
              {!hasWrapped(event) && (
                <View onLayout={onPrimaryLayout}>
                  {isHost ? (
                    <Button
                      label="Manage event"
                      onPress={() => {
                        onCloseAll();
                        router.push(`/events/host/${event.id}`);
                      }}
                    />
                  ) : isParticipant ? (
                    <Button
                      label="Open chat"
                      onPress={() => {
                        onCloseAll();
                        router.push(`/(tabs)/chats/${event.id}`);
                      }}
                    />
                  ) : (
                    <View style={styles.footerRow}>
                      {event.max_people != null && (
                        <View style={styles.spotsInfo}>
                          <Text style={styles.spotsCount}>
                            {event.participant_count}/{event.max_people}
                          </Text>
                          <Text style={styles.spotsLeft}>
                            {Math.max(
                              event.max_people - event.participant_count,
                              0
                            )}{' '}
                            spots left
                          </Text>
                        </View>
                      )}
                      <Button
                        style={{ flex: 1 }}
                        label={
                          isPending
                            ? 'Request pending'
                            : womenOnlyLocked
                              ? 'Female-only event'
                              : isFull
                                ? 'Event full'
                                : tooFar
                                  ? 'Join with Mello+'
                                  : event.requires_approval
                                    ? 'Request to join'
                                    : 'Join event'
                        }
                        variant={
                          isPending || isFull || womenOnlyLocked
                            ? 'tertiary'
                            : 'primary'
                        }
                        onPress={() =>
                          isPending ? leave.mutate() : handleJoinPress()
                        }
                        disabled={
                          ((isFull || womenOnlyLocked) && !isPending) ||
                          join.isPending ||
                          leave.isPending
                        }
                      />
                    </View>
                  )}
                </View>
              )}
```

Also remove the `hasWrapped(event) && (isParticipant || isHost)` "Open the event wrap" `<Button>` block immediately above it (around lines 1289-1300) — it moved into `renderFooter` in Step 3 too.

Delete both blocks entirely — that content now lives only in `renderFooter`.

- [ ] **Step 5: Add the footer's own styles**

In the `styles` object, near `footerRow`/`spotsInfo` (around line 1917), add:

```ts
  // Wraps the primary action inside BottomSheetFooter. Frosted-white to
  // match the sheet's own surface — it's the same card, just pinned.
  ctaFooter: {
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[3],
  },
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors. If `onPrimaryLayout`/`primaryBottomRef` still exist from before Task 4/5, remove them now — they have no remaining call site.

- [ ] **Step 7: Commit**

```bash
git add src/components/events/EventBottomSheet.tsx
git commit -m "feat(events): pin the primary CTA as a persistent footer"
```

---

### Task 6: Banner reorder — pending requests joins who's-going and nearby

**Files:**
- Modify: `src/components/events/EventBottomSheet.tsx:1241-1281` (move `pendingSection`), `:1283-1288` (the now-simplified `actions` open tag)

**Interfaces:** none new — pure reorder of existing JSX blocks, same props, same conditions.

- [ ] **Step 1: Cut `pendingSection` from above `actions`**

Find (around lines 1241-1281, the `{/* Host: pending join requests to approve/reject */}` block) sitting directly before `<View style={styles.actions} onLayout={onActionsLayout}>`. Cut this whole block (from the comment through its closing `)}`).

- [ ] **Step 2: Paste it inside `actions`, after the secondary buttons and before the who's-going card**

Inside `<View style={styles.actions} onLayout={onActionsLayout}>`, after the "host also gets the chat" / "Check in" `<>...</>` block (what was around lines 1378-1404) and before the `{/* Who's going ... */}` comment (what was around line 1406), paste the cut block back in:

```tsx
              {/* Host: pending join requests to approve/reject. Moved below
                    the pinned CTA — it's part of the scroll-revealed banner
                    now, alongside who's-going and Happening near you. */}
              {isHost && pending.length > 0 && (
                <View style={styles.pendingSection}>
                  <SectionLabel style={styles.sectionLabel}>
                    Requests · {pending.length}
                  </SectionLabel>
                  {pending.map((p) => (
                    <View key={p.id} style={styles.pendingRow}>
                      <Avatar name={p.name} photoUrl={p.photo_url} size={38} />
                      <View style={styles.pendingNameWrap}>
                        <Text style={styles.pendingName} numberOfLines={1}>
                          {p.name}
                        </Text>
                        {isPremium(p) && <PremiumBadge size={13} />}
                      </View>
                      <PressableScale
                        scaleTo={0.92}
                        style={styles.approveBtn}
                        onPress={() => approve.mutate(p.id)}
                        disabled={approve.isPending}
                      >
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </PressableScale>
                      <PressableScale
                        scaleTo={0.92}
                        style={styles.rejectBtn}
                        onPress={() => reject.mutate(p.id)}
                        disabled={reject.isPending}
                        accessibilityLabel="Decline request"
                      >
                        <Icon
                          name="close"
                          size={16}
                          color="rgba(0,0,0,0.55)"
                          strokeWidth={2}
                        />
                      </PressableScale>
                    </View>
                  ))}
                </View>
              )}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors — this is a pure JSX relocation, nothing about types changes.

- [ ] **Step 3: Commit**

```bash
git add src/components/events/EventBottomSheet.tsx
git commit -m "feat(events): move pending requests below the CTA, into the scroll-revealed banner"
```

---

### Task 7: Wire the description into `RevealingText`

**Files:**
- Modify: `src/components/events/EventBottomSheet.tsx:1237-1239` (the description render), plus new refs/state near the other layout refs

**Interfaces:**
- Consumes: `RevealingText` (Task 3), `CTA_BOTTOM_INSET` (Task 5).

This is the task that actually turns the plain description `<Text>` into the clamp-and-reveal behavior — everything before this task builds the pieces; this task assembles them.

- [ ] **Step 1: Add the pre-description height ref**

Near `actionsYRef`/`goingCardYRef` (from Task 5's version), add:

```ts
  const [descriptionOffset, setDescriptionOffset] = useState(0);
  const onDescriptionBlockLayout = useCallback((e: LayoutChangeEvent) => {
    const y = e.nativeEvent.layout.y;
    setDescriptionOffset((prev) => (prev === y ? prev : y));
  }, []);
```

- [ ] **Step 2: Compute the available height and footer boundary**

Near where `contentPadBottom`/`heroGrow` are computed (after Task 4/5's hero-sizing block), add:

```ts
  // Screen-space y of the pinned footer's top edge — BottomSheetFooter
  // docks it `CTA_BOTTOM_INSET` above the screen's bottom edge regardless
  // of the sheet's own snap stop (see Task 5), so this is a plain constant
  // once we know the device height.
  const footerTopY = height - CTA_BOTTOM_INSET - (footerHeightRef.current ?? 0);

  // Vertical space between the description's own top and the footer's top
  // edge, at rest — everything above the description (host row, title,
  // info, pills) plus a small gap is already spent by `descriptionOffset`.
  const descriptionAvailableHeight = Math.max(
    0,
    firstSnapPx != null
      ? firstSnapPx - BANNER_H - descriptionOffset - SPACING[2.5]
      : 0
  );
```

- [ ] **Step 3: Replace the description render**

Find (around lines 1237-1239):

```tsx
            {event.description && (
              <Text style={styles.description}>{event.description}</Text>
            )}
```

Replace with:

```tsx
            {event.description && (
              <RevealingText
                text={event.description}
                style={styles.description}
                availableHeight={descriptionAvailableHeight}
                offset={BANNER_H + descriptionOffset}
                heroGrow={heroGrow}
                sheetProgress={animatedIndex}
                footerBoundary={footerTopY}
                onLayout={onDescriptionBlockLayout}
              />
            )}
```

- [ ] **Step 4: Add the import**

At the top of the file, alongside the other local component imports:

```ts
import { RevealingText } from './RevealingText';
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — this task touches no tested logic directly, but confirms nothing else broke.

- [ ] **Step 7: Commit**

```bash
git add src/components/events/EventBottomSheet.tsx
git commit -m "feat(events): clamp the description dynamically and reveal it line by line"
```

---

### Task 8: Manual device verification

**Files:** none — this task is a manual pass, no code changes.

No component test exists for this file and none is being added (Reanimated 4 throws under Jest — see Global Constraints). This task is the only verification that the actual interaction works.

- [ ] **Step 1: Start the app**

Run: `npx expo start` (or the project's existing dev-server invocation) and open the event sheet for three events: one with a short description (1 line), one with a medium description (fits fully above the footer), and one with a long description (multiple hidden lines).

- [ ] **Step 2: Verify the resting stop**

For all three events: confirm the description shows the correct clamped line count with a trailing "…" only when truncated, and the pinned CTA sits exactly where it does on the current production build (visually compare against `main` if unsure).

- [ ] **Step 3: Verify the first-scroll drag**

Drag from resting to full-screen. Confirm: the CTA does not move on screen at all during the drag; the hero photo grows into a square (height ≈ screen width); nothing flashes or jumps.

- [ ] **Step 4: Verify the free-scroll reveal**

Once full-screen, scroll down slowly on the long-description event. Confirm: hidden lines fade + rise into place one at a time as they clear the CTA's top edge (not the screen's bottom edge — there should be a visible gap where a line is still hidden behind the footer before it's due); once all lines have revealed, continued scroll brings up pending requests (if you're the host with open requests), then who's-going, then "Happening near you," in that order; the CTA never moves at any point.

- [ ] **Step 5: Repeat on Android**

This file's own history flags Android-specific issues (elevation/shadow clipping on the who's-going card, `SafeAreaView` being a no-op). Confirm the footer's frosted background and the who's-going card's shadow both still render correctly there, and that `insets.bottom`-derived spacing (`CTA_BOTTOM_INSET`, `contentPadBottom`) leaves the footer clear of any on-screen nav bar.

- [ ] **Step 6: Report findings**

If anything in Steps 2-5 doesn't match, note exactly what and on which device/event before considering this plan complete — per this repo's own convention, "untested on Android" (or whatever the actual gap is) is worth more than silence.
