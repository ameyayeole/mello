# Event Deck — One Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the map's "Up for it?" fan and the swipe deck it opens a single component with two sizes, so expanding is one interpolation rather than a hand-off between two renderings.

**Architecture:** A new `EventDeck` in the root portal, always mounted while on the map. One shared value `expand` (0 = parked in the corner, 1 = open) drives every card's slot, the dim, the content fade, and both sets of chrome. Each card is one element that never unmounts, so there is nothing to hand off.

**Tech Stack:** Expo 56, React Native 0.85.3, Reanimated 4.3.1, react-native-gesture-handler 2.31.1, expo-haptics, react-native-screens (`FullWindowOverlay`), zustand, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-08-04-event-deck-one-component-design.md` — read it first; it records the reasoning and the one constraint that governs the whole design.

## Global Constraints

- **Read the versioned Expo docs** at https://docs.expo.dev/versions/v56.0.0/ before writing code.
- **Never hardcode a colour** — `COLORS` from `@/constants/colors`. **Never a font family** — `FONTS`. **Font sizes from `TYPE_SIZE`**: the real steps are `display, h1, titleLg, sectionLg, bodyMd, title, section, bodyLg, body, bodySm, caption, micro, nano`; `FONTS` families are `medium, semibold, bold, heavy, heading, headingBold` — there is no `regular`. Spacing/radii from `SPACING`/`RADIUS`. One-off layout numbers and glyph metrics are fine — comment when non-obvious.
- **Never fork a `ui/` primitive that is missing a prop — add the prop.**
- Buttons are `Button` with `primary`/`secondary`/`tertiary` only. There are no pill buttons.
- **`CardPortal` must only be mounted while it is meant to be on top.** On iOS `FullWindowOverlay` attaches to the key window at mount. See Task 3 — this is the single most dangerous thing in this plan.
- Comment the *why* — the constraint, or the bug that shaped the code.
- **Reanimated 4 throws on import under Jest.** Nothing visual here is unit-testable; logic is tested by extracting it to plain modules.
- Verification: `npm run typecheck`, `npm test`, `npm run lint`. **Baselines move — other work is landing on `main` in parallel.** Record the numbers *before* your task and compare against those, not against a number written here. `npx tsc --noEmit` and `npx eslint <your files>` scoped to your own files is the reliable check; the repo as a whole may not typecheck because of someone else's in-flight work.

---

## File Structure

**Create:**

| File | Responsibility |
| --- | --- |
| `src/components/events/deckSlots.ts` | Pure: a card's minimized slot and expanded slot by depth, and the minimized-visibility predicate. No React. |
| `src/components/events/__tests__/deckSlots.test.ts` | Tests for the above — the only testable part. |
| `src/components/events/EventDeck.tsx` | The component. Both sizes, the gestures, the chrome. |

**Modify:** `src/components/events/EventCard.tsx` (an `emerge` prop), `app/_layout.tsx` (mount `EventDeck`), `app/(tabs)/map.tsx` (drop the teaser), `src/components/events/EventDealtCard.tsx` (drop the swipe-deck branch), `src/stores/uiStore.ts` (drop the fan-carrying fields).

**Delete:** `src/components/map/SwipeDeckTeaser.tsx`.

---

## Task 1: The slot table and the visibility rule

**Files:**
- Create: `src/components/events/deckSlots.ts`
- Test: `src/components/events/__tests__/deckSlots.test.ts`

**Interfaces:**
- Consumes: `stackLayer`, `STACK_DEPTH` from `@/components/ui/dealtCardGeometry`.
- Produces:
  - `interface DeckSlot { x: number; y: number; rotate: number; scale: number; opacity: number }`
  - `MINI_W = 82`, `MINI_H = 110`, `FAN_W = 116`, `FAN_H = 138`
  - `miniSlot(depth: number, cardW: number, cardH: number): DeckSlot`
  - `expandedSlot(depth: number): DeckSlot`
  - `deckVisible(args: { onMap: boolean; creatingEvent: boolean; overlayOpen: boolean; expanded: boolean }): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import {
  miniSlot,
  expandedSlot,
  deckVisible,
  MINI_W,
  MINI_H,
} from '../deckSlots';
import { STACK_DEPTH, stackLayer } from '@/components/ui/dealtCardGeometry';

const CARD_W = 300;
const CARD_H = 465;

describe('miniSlot', () => {
  it('scales a full card down to the fan mini', () => {
    expect(miniSlot(0, CARD_W, CARD_H).scale).toBeCloseTo(MINI_W / CARD_W, 5);
  });

  // The fan reads as a hand of cards because they lean different ways. A
  // uniform tilt would be a neat pile, which is not the same object.
  it('fans the cards at different angles', () => {
    const a = miniSlot(0, CARD_W, CARD_H).rotate;
    const b = miniSlot(1, CARD_W, CARD_H).rotate;
    const c = miniSlot(2, CARD_W, CARD_H).rotate;
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('leans the front card the opposite way to the ones behind it', () => {
    expect(miniSlot(0, CARD_W, CARD_H).rotate).toBeGreaterThan(0);
    expect(miniSlot(1, CARD_W, CARD_H).rotate).toBeLessThan(0);
    expect(miniSlot(2, CARD_W, CARD_H).rotate).toBeLessThan(0);
  });

  // Anything past the three the fan shows sits exactly under the third, so a
  // deep deck does not spray cards across the corner of the map.
  it('parks anything deeper than the fan under the last visible mini', () => {
    expect(miniSlot(5, CARD_W, CARD_H)).toEqual(miniSlot(2, CARD_W, CARD_H));
  });

  it('is deterministic', () => {
    expect(miniSlot(1, CARD_W, CARD_H)).toEqual(miniSlot(1, CARD_W, CARD_H));
  });
});

describe('expandedSlot', () => {
  it('is the messy stack the dealt card already uses', () => {
    for (let d = 0; d <= STACK_DEPTH; d++) {
      const slot = expandedSlot(d);
      const layer = stackLayer(d);
      expect(slot.x).toBe(layer.x);
      expect(slot.y).toBe(layer.y);
      expect(slot.rotate).toBe(layer.rotate);
      expect(slot.scale).toBe(layer.scale);
    }
  });
});

describe('deckVisible', () => {
  const base = {
    onMap: true,
    creatingEvent: false,
    overlayOpen: false,
    expanded: false,
  };

  it('shows the parked fan on the map', () => {
    expect(deckVisible(base)).toBe(true);
  });

  it('hides the parked fan off the map', () => {
    expect(deckVisible({ ...base, onMap: false })).toBe(false);
  });

  // The portal is mounted for as long as this is visible, and it paints over
  // everything — so the fan must get out of the way of anything that takes the
  // screen. Nothing in tsc or the tests can catch this being wrong in the app;
  // this test is the only thing pinning it.
  it('hides the parked fan while creating an event', () => {
    expect(deckVisible({ ...base, creatingEvent: true })).toBe(false);
  });

  it('hides the parked fan under a full-screen overlay', () => {
    expect(deckVisible({ ...base, overlayOpen: true })).toBe(false);
  });

  // Expanded is the top thing on screen by definition — it does not matter
  // what route you were on when it opened.
  it('shows when expanded regardless of everything else', () => {
    expect(
      deckVisible({
        onMap: false,
        creatingEvent: true,
        overlayOpen: true,
        expanded: true,
      })
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/components/events/__tests__/deckSlots.test.ts`
Expected: FAIL — cannot find module `../deckSlots`.

- [ ] **Step 3: Implement**

Create `src/components/events/deckSlots.ts`. The fan's numbers come from the
component this replaces (`SwipeDeckTeaser`): minis are 82×110 inside a 116×138
stack, tilted `5° / -7° / -19°` at offsets `(12, 0) / (0, 3) / (-12, 8)`.

```ts
import { STACK_DEPTH, stackLayer } from '@/components/ui/dealtCardGeometry';

// Where a card sits in the corner of the map, and where it sits when the deck
// is open. No React and no Reanimated, so the numbers that decide how this
// looks can be tested — which nothing else about it can be.

export interface DeckSlot {
  x: number;
  y: number;
  // degrees
  rotate: number;
  scale: number;
  opacity: number;
}

// The fan's own dimensions, carried over from SwipeDeckTeaser.
export const MINI_W = 82;
export const MINI_H = 110;
export const FAN_W = 116;
export const FAN_H = 138;

// Front card leans one way, the two behind fan away the other — a hand of
// cards peeking out of a pocket rather than a tidy pile.
const FAN = [
  { x: 12, y: 0, rotate: 5 },
  { x: 0, y: 3, rotate: -7 },
  { x: -12, y: 8, rotate: -19 },
] as const;

/**
 * A card's slot in the parked fan, expressed relative to the card's own full
 * size — so the same element that fills the screen when open can sit in the
 * corner without ever being re-rendered at a different size.
 */
export function miniSlot(depth: number, cardW: number, cardH: number): DeckSlot {
  'worklet';
  // Anything past the three the fan shows sits under the third: a deep deck
  // must not spray cards across the corner of the map.
  const f = FAN[Math.min(Math.max(depth, 0), FAN.length - 1)];
  return {
    x: f.x,
    y: f.y,
    rotate: f.rotate,
    // Width drives the scale; the card's aspect is fixed, so height follows.
    scale: MINI_W / cardW,
    opacity: 1,
  };
}

/** A card's slot when the deck is open — the same messy stack a dealt card uses. */
export function expandedSlot(depth: number): DeckSlot {
  'worklet';
  const l = stackLayer(depth);
  return { x: l.x, y: l.y, rotate: l.rotate, scale: l.scale, opacity: l.opacity };
}

/**
 * Whether the deck renders at all.
 *
 * This is a rule rather than an accident because of where the deck lives. It
 * sits in the root portal, and on iOS that overlay attaches to the key window
 * when it mounts — so for as long as the parked fan is visible, an overlay is
 * mounted over the whole app. It therefore has to get out of the way of
 * anything that takes the screen, or it floats above the create-event flow.
 *
 * Expanded ignores all of it: the open deck IS the top thing on screen.
 */
export function deckVisible({
  onMap,
  creatingEvent,
  overlayOpen,
  expanded,
}: {
  onMap: boolean;
  creatingEvent: boolean;
  overlayOpen: boolean;
  expanded: boolean;
}): boolean {
  if (expanded) return true;
  return onMap && !creatingEvent && !overlayOpen;
}
```

Note `STACK_DEPTH` is imported for the test's sake and by `expandedSlot`'s
contract; if the implementation does not need it directly, do not import it
just to satisfy a linter.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest src/components/events/__tests__/deckSlots.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit 2>&1 | grep deckSlots   # expect nothing
npx eslint src/components/events/deckSlots.ts src/components/events/__tests__/deckSlots.test.ts
git add src/components/events/deckSlots.ts src/components/events/__tests__/deckSlots.test.ts
git commit -m "feat(events): the deck's two slots, and the rule for when it shows

A card's place in the map's corner and its place in the open stack, as
one pure module, so the same element can move between them without ever
being re-rendered at a different size.

deckVisible is a rule rather than an accident: the deck lives in the root
portal, and on iOS that overlay attaches to the key window when it mounts
— so while the parked fan is visible, an overlay is mounted over the
whole app and has to get out of the way of anything that takes the
screen. Its test is the only thing that can catch that being wrong."
```

---

## Task 2: `EventCard` gains `emerge`

**Files:**
- Modify: `src/components/events/EventCard.tsx`

**Interfaces:**
- Produces: `emerge?: number` on `EventCardProps` — 0 hides the glass pane entirely, 1 shows it. **Defaults to 1**, so every existing caller is unaffected.

- [ ] **Step 1: Add the prop**

The card at fan size is a photo with nothing on it; at full size it carries the
pane. `emerge` is what gets it from one to the other without the element ever
swapping — the photo is the same node throughout, it just gains its furniture.

```tsx
  // How much of the card's furniture is showing. 0 = the bare photo, which is
  // what a card looks like parked in the map's corner; 1 = the full card. The
  // deck drives this from its own expand progress so the pane fades in over
  // the last part of the growth, and the photo element never swaps — that is
  // what makes it read as one object getting bigger rather than a small card
  // being replaced by a large one.
  //
  // Defaults to 1: every other caller renders a finished card.
  emerge?: number;
```

Apply it to the `Glass` pane's wrapper only — not to the photo, the category
pill or the save/share chips, which have their own visibility rules. A plain
`style={{ opacity: emerge }}` is enough; this does not need to be animated
here, because the deck passes an already-animated value.

**If `emerge` cannot be a plain number** because the deck drives it from a
shared value, take it as a Reanimated `SharedValue<number>` instead and apply
it with `useAnimatedStyle`. Decide from what Task 3 actually needs and say
which you chose in your report — do not implement both.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit 2>&1 | grep EventCard` — expect nothing.
Run: `npm test` — the count must not change; this task adds no tests and breaks none.

- [ ] **Step 3: Commit**

```bash
git add src/components/events/EventCard.tsx
git commit -m "feat(events): let a card show less of itself

`emerge` fades the glass pane and its contents, leaving the bare photo at
0. It is what lets one card element sit in the map's corner as a plain
photo and become a full card as it grows, without the element ever being
swapped for a different one.

Defaults to 1, so every existing caller renders exactly what it did."
```

---

## Task 3: `EventDeck`

**Files:**
- Create: `src/components/events/EventDeck.tsx`
- Read first: `src/components/map/SwipeDeckTeaser.tsx` (the fan it replaces), `src/components/ui/DealtCard.tsx` (the gestures, haptics and portal it mirrors), `src/components/events/DeckChrome.tsx`, `src/components/events/DeckEmptyCard.tsx`

**Interfaces:**
- Consumes: `miniSlot`, `expandedSlot`, `deckVisible` (Task 1); `emerge` (Task 2); `stackLayer`, `isPastThreshold`, `SWIPE_THRESHOLD_RATIO`, `FLIP_MS`, `PROMOTE_MS` from `@/components/ui/dealtCardGeometry`; `useSwipeDeck`, `useRecordSwipe`, `useSwipeQuota` from `@/hooks/useSwipeDeck`; `DeckCounter`, `DeckActions`; `DeckEmptyCard`; `EventCard`; `useUIStore`.
- Produces: `export function EventDeck(): JSX.Element | null`

- [ ] **Step 1: Build it**

No test — Reanimated 4 throws under Jest. Everything testable is in Task 1.

The shape:

- One `expand` shared value, 0 → 1, `withTiming` on tap and back down on
  minimize. Every card's transform interpolates `miniSlot(depth)` →
  `expandedSlot(depth)` on it. **There is no per-card stagger and no arc.**
  The whole point is that this is one object changing size; a stagger would
  re-introduce the thing the spec exists to remove.
- The dim's opacity and `EventCard`'s `emerge` both ride `expand` —
  `emerge` over the last third (`interpolate(expand, [0.66, 1], [0, 1])`), so
  the pane arrives once the card is nearly full size.
- Parked chrome ("Up for it?" label, the count badge) fades out on `expand`;
  `DeckCounter` and `DeckActions` fade in.
- Six cards render (`STACK_DEPTH + 2`), from the live deck at the current index.
- The parked fan keeps its existing gentle sway (see `SwipeDeckTeaser`) — but
  only while parked.

Gestures, matching the spec's table: tap the fan expands; tap a card flips;
horizontal pans pass/save through `useRecordSwipe` with the quota guard; drag
down minimizes; tapping the dim minimizes. Reuse `DealtCard`'s axis gating —
horizontal always active, vertical active only on the front face — and its
`onFinalize` reset with the `settling` guard. Both exist because of real bugs;
read the comments before reimplementing.

Haptics: selection on expand, medium when the deck lands open, light on the
flip crossing, selection on the swipe threshold, success on a save.

**Visibility:** `deckVisible({ onMap, creatingEvent, overlayOpen, expanded })`
with `onMap` from `usePathname() === '/map'`. Return `null` when false. Wrap in
`CardPortal` — copy it from `EventDealtCard` or export it; do not write a second
one.

- [ ] **Step 2: Verify**

`npx tsc --noEmit` (grep your files), `npm test` (unchanged), `npx eslint` on the new file.

- [ ] **Step 3: Commit**

Message should say what it replaces and why one element beats two.

---

## Task 4: Mount it, and unmount what it replaces

**Files:**
- Modify: `app/_layout.tsx`, `app/(tabs)/map.tsx`, `src/components/events/EventDealtCard.tsx`, `src/stores/uiStore.ts`
- Delete: `src/components/map/SwipeDeckTeaser.tsx`

- [ ] **Step 1: Swap them over**

- Mount `<EventDeck />` in `app/_layout.tsx` beside `<EventDealtCard />`.
- Remove `<SwipeDeckTeaser />` from `app/(tabs)/map.tsx` and delete the file.
- Remove `EventDealtCard`'s `isSwipeDeck` branch: the `DeckCounter`/`DeckActions`
  header/footer, the `DeckEmptyCard` path, `useSwipeQuota`/`useRecordSwipe`,
  `originTilts`, and the empty-state interception. A pin's card deals one event
  and closes on a swipe — that is all it does now.
- Remove `uiStore.swipeDeckOrigin`/`setSwipeDeckOrigin` and
  `dealtCard.origins`. **Check `DealtCardSource` afterwards:** if `'swipeDeck'`
  has no remaining producer, remove the discriminant entirely and simplify the
  quota branch it guarded. If it does still have one, leave it and say where.
- `DeckChrome` and `DeckEmptyCard` move to being `EventDeck`'s — no longer
  imported by `EventDealtCard`.

- [ ] **Step 2: Prove nothing is left dangling**

```bash
grep -rn "SwipeDeckTeaser\|swipeDeckOrigin\|dealtCard.origins\|originTilts" src app
```
Every hit must be inside something you are deleting. A live one means stop and
report rather than delete around it.

- [ ] **Step 3: Verify and commit**

Record the typecheck/test/lint numbers before and after in your report. The
deleted file will take its lint warnings with it, so the warning count should
*drop* — say by how much.

---

## Task 5: The device sheet

**Files:**
- Create or extend: `docs/testing/` — extend `dealt-event-card.md` if the deck's rows belong beside the card's, otherwise a new sheet.

- [ ] **Step 1: Write the rows**

Ordered by risk, marking which check reasoning rather than something observed.
The highest-risk rows, from the spec's §9:

1. **The fan does not appear over the create-event flow, the map filters, or any pushed route.** This is the portal constraint and the one thing that can be badly wrong; `deckVisible`'s unit test covers the predicate but not the wiring.
2. Expanding and minimizing reads as one object moving, not two swapping.
3. The pane fades in over the last third rather than popping.
4. Swiping past a page boundary (20 cards) neither stalls nor empties the deck.
5. Android: the fan sits above the tab bar, and the portal's Android path — a plain sibling, no `FullWindowOverlay` — still paints above the map.
6. A dealt card from a map pin still behaves exactly as before, now that the swipe-deck branch is gone from it.

- [ ] **Step 2: Commit**

---

## Self-Review

**Spec coverage:** §2 one component → Tasks 1, 3. §3 where it lives and the visibility rule → Tasks 1 (predicate), 3 (wiring), 5 (row 1). §4 the morph → Tasks 2, 3. §5 infinite deck → Task 3. §6 gestures → Task 3. §7 what stays separate → Task 4's scoping. §8 deletions → Task 4. §9 verification → Tasks 1 and 5.

**Placeholders:** Task 3 gives shape and constraints rather than a full component body — deliberate, because it is a large component whose parts (gestures, haptics, portal) already exist in `DealtCard` and should be read from there rather than transcribed here and allowed to drift.

**Type consistency:** `DeckSlot`, `miniSlot`, `expandedSlot`, `deckVisible` (Task 1) are consumed only by Task 3. `emerge` (Task 2) is set only by Task 3. Nothing in Task 4 introduces a new type.

**Known open decision:** Task 2 leaves `emerge`'s type (plain number vs `SharedValue`) to be settled by what Task 3 needs, and asks for the choice to be reported. That is a real fork, not a placeholder — implementing both would be the mistake.
