# Dealt Event Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the event bottom sheet with a card that is dealt out of whatever you tapped, lands centre screen over an 80% dim with a messy stack of four behind it, and flips to its back on a tap.

**Architecture:** A content-agnostic `DealtCard` primitive in `ui/` owns the presentation (deal, dim, stack, flip, gestures, haptics). `EventCard` is the card object itself and is also the community feed's inline card. `EventCardBack` is the scrolling reverse. All non-visual logic is *extracted* from `EventBottomSheet.tsx` into pure functions plus a hook, never retyped. Geometry and gate logic are pure modules so they can be tested without a renderer.

**Tech Stack:** Expo 56, React Native 0.85.3, Reanimated 4.3.1, react-native-gesture-handler 2.31.1, expo-haptics, expo-blur, react-native-maps 1.27.2, zustand, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-08-03-dealt-event-card-design.md`

## Global Constraints

- **Read the versioned Expo docs** at https://docs.expo.dev/versions/v56.0.0/ before writing code.
- **Never hardcode a colour.** Use `COLORS` from `@/constants/colors`.
- **Never hardcode a font family.** Use `FONTS` from `@/constants/typography`.
- **Font sizes in new UI use `TYPE` / `TYPE_SIZE`** from `src/components/ui/`.
- **Buttons are `Button` with `primary` / `secondary` / `tertiary` only.** No pill buttons. Do not style a `PressableScale` to look like a button.
- **Query keys live in `src/constants/queryKeys.ts`** when more than one file touches them.
- **`react-native`'s `SafeAreaView` is a no-op on Android.** Use `useSafeAreaInsets`.
- **There is no CSS `filter` in React Native.** The stack's "82% brightness" is an overlay `View`, not a filter. See Task 3.
- **Component tests do not exist and cannot** — Reanimated 4 throws on import under Jest. Test logic by extracting it to plain modules, the way `participationMutations` in `useEventParticipation.ts` is factored.
- Verify after every task: `npm run typecheck` (must stay 0), `npm test` (must stay green), `npm run lint` (0 errors / 65 warnings pre-existing; add none).
- Swipe threshold is `width * 0.28` — the same value `app/events/swipe.tsx:80` uses. Do not invent a second one.
- Stack depth is 4 cards behind the top. Angles come from a fixed table, never `Math.random()`.

---

## File Structure

**Create:**

| File | Responsibility |
| --- | --- |
| `src/components/ui/dealtCardGeometry.ts` | Pure geometry: stack transform table, dim overlay, swipe threshold, deal keyframes. No React. |
| `src/components/ui/__tests__/dealtCardGeometry.test.ts` | Tests for the above. |
| `src/components/ui/DealtCard.tsx` | The presentation primitive. Content-agnostic. |
| `src/utils/eventCardGates.ts` | Pure join-gate + safety-queue builders, extracted from the sheet. |
| `src/utils/__tests__/eventCardGates.test.ts` | Tests for the above. |
| `src/hooks/useEventCard.ts` | Binds the gates, participation mutations and wishlist to one event. |
| `src/components/events/EventCard.tsx` | The card object. Front face and the community feed's inline card. |
| `src/components/events/EventCardBack.tsx` | The scrolling reverse. |
| `src/components/events/EventDealtCard.tsx` | Binds `DealtCard` + `EventCard` + `EventCardBack` + `useEventCard`. |
| `src/stores/__tests__/uiStore.dealtCard.test.ts` | Deck advance / dismiss / origin-consumption rules. |
| `docs/testing/dealt-event-card.md` | Device test sheet. |

**Modify:** `src/stores/uiStore.ts`, `app/(tabs)/_layout.tsx`, `app/(tabs)/map.tsx`, `app/friends/[userId].tsx`, `app/events/wishlist.tsx`, `app/events/swipe.tsx`, `src/components/ui/index.ts`, `src/components/events/index.ts` (if present).

**Delete (Task 9):** `src/components/events/EventBottomSheet.tsx`, `src/components/events/EventSheetStack.tsx`, `src/components/events/RevealingText.tsx`, `src/components/events/useEnterOnScroll.ts`.

---

## Task 1: Deck state in `uiStore`

**Files:**
- Modify: `src/stores/uiStore.ts`
- Test: `src/stores/__tests__/uiStore.dealtCard.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export interface DealtOrigin { x: number; y: number; width: number; height: number }`
  - `export interface DealtCardState { ids: string[]; index: number; origin: DealtOrigin | null }`
  - store fields: `dealtCard: DealtCardState | null`
  - actions: `dealCard(ids: string[], index: number, origin: DealtOrigin | null): void`, `advanceDealtCard(): void`, `closeDealtCard(): void`

- [ ] **Step 1: Write the failing test**

Create `src/stores/__tests__/uiStore.dealtCard.test.ts`:

```ts
import { useUIStore } from '../uiStore';

const ORIGIN = { x: 100, y: 200, width: 34, height: 34 };

function reset() {
  useUIStore.getState().closeDealtCard();
}

describe('uiStore dealt card', () => {
  beforeEach(reset);

  it('opens a deck at the given index with its origin', () => {
    useUIStore.getState().dealCard(['a', 'b', 'c'], 0, ORIGIN);
    expect(useUIStore.getState().dealtCard).toEqual({
      ids: ['a', 'b', 'c'],
      index: 0,
      origin: ORIGIN,
    });
  });

  // The origin belongs to the FIRST card only. Once you have swiped, the
  // element the current card came from is no longer on screen, so dismiss must
  // not fly back to it.
  it('drops the origin on the first advance', () => {
    useUIStore.getState().dealCard(['a', 'b', 'c'], 0, ORIGIN);
    useUIStore.getState().advanceDealtCard();
    expect(useUIStore.getState().dealtCard).toEqual({
      ids: ['a', 'b', 'c'],
      index: 1,
      origin: null,
    });
  });

  it('closes when the last card is advanced past', () => {
    useUIStore.getState().dealCard(['a', 'b'], 0, ORIGIN);
    useUIStore.getState().advanceDealtCard();
    useUIStore.getState().advanceDealtCard();
    expect(useUIStore.getState().dealtCard).toBeNull();
  });

  it('advancing with nothing open is a no-op', () => {
    useUIStore.getState().advanceDealtCard();
    expect(useUIStore.getState().dealtCard).toBeNull();
  });

  it('can open partway into a deck', () => {
    useUIStore.getState().dealCard(['a', 'b', 'c'], 2, null);
    expect(useUIStore.getState().dealtCard?.index).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/stores/__tests__/uiStore.dealtCard.test.ts`
Expected: FAIL — `dealCard is not a function`.

- [ ] **Step 3: Implement the store slice**

In `src/stores/uiStore.ts`, add near the `Handoff` interface (it is the same
kind of thing — a measured screen rect handed to an overlay, see the comment
there):

```ts
// Where the element a dealt card came out of sat, in window coordinates, at
// the moment it was tapped: a map pin, a feed card, a rail item. The card is
// drawn at this rect and arcs to the centre of the screen, so the thing you
// pressed becomes the thing you are looking at.
//
// Same idea as `Handoff` above, and measured for the same reason: the rect
// depends on layout nobody should be re-deriving.
export interface DealtOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The open card and the deck behind it. `ids` is the whole deck; `index` is
// which one is face up.
//
// `origin` belongs to the FIRST card only and is dropped on the first advance:
// once you have swiped, nothing on screen is where the current card came from,
// and flying back to the original pin would claim you are looking at an event
// you are not.
export interface DealtCardState {
  ids: string[];
  index: number;
  origin: DealtOrigin | null;
}
```

Add to the `UIState` interface:

```ts
  dealtCard: DealtCardState | null;
  dealCard: (
    ids: string[],
    index: number,
    origin: DealtOrigin | null
  ) => void;
  advanceDealtCard: () => void;
  closeDealtCard: () => void;
```

Add to the store body (keep `selectedEventId` for now — Task 8 removes it):

```ts
  dealtCard: null,
  dealCard: (ids, index, origin) => set({ dealtCard: { ids, index, origin } }),
  advanceDealtCard: () =>
    set((s) => {
      if (!s.dealtCard) return s;
      const next = s.dealtCard.index + 1;
      if (next >= s.dealtCard.ids.length) return { dealtCard: null };
      return { dealtCard: { ...s.dealtCard, index: next, origin: null } };
    }),
  closeDealtCard: () => set({ dealtCard: null }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/stores/__tests__/uiStore.dealtCard.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/stores/uiStore.ts src/stores/__tests__/uiStore.dealtCard.test.ts
git commit -m "feat(ui): add dealt-card deck state to uiStore

The origin is dropped on the first advance. Once you have swiped, nothing
on screen is where the current card came from, so dismiss must not fly
back to the pin that opened the deck."
```

---

## Task 2: Stack and deal geometry

**Files:**
- Create: `src/components/ui/dealtCardGeometry.ts`
- Test: `src/components/ui/__tests__/dealtCardGeometry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `STACK_DEPTH: 4`
  - `SWIPE_THRESHOLD_RATIO: 0.28`
  - `SWIPE_VELOCITY: 900`
  - `DEAL_MS: 620`, `DISMISS_MS: 380`, `FLIP_MS: 460`, `PROMOTE_MS: 460`
  - `interface StackLayer { x: number; y: number; rotate: number; scale: number; opacity: number; shade: number }`
  - `stackLayer(depth: number): StackLayer`
  - `isPastThreshold(dx: number, velocityX: number, width: number): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/__tests__/dealtCardGeometry.test.ts`:

```ts
import {
  STACK_DEPTH,
  stackLayer,
  isPastThreshold,
  SWIPE_THRESHOLD_RATIO,
} from '../dealtCardGeometry';

describe('stackLayer', () => {
  it('leaves the top card untransformed and unshaded', () => {
    expect(stackLayer(0)).toEqual({
      x: 0,
      y: 0,
      rotate: 0,
      scale: 1,
      opacity: 1,
      shade: 0,
    });
  });

  // Determinism is the whole point: a random angle re-rolls on every
  // re-render, so a card twitches when something unrelated updates and it
  // reads as a rendering fault.
  it('is deterministic', () => {
    expect(stackLayer(2)).toEqual(stackLayer(2));
    expect(stackLayer(3)).toEqual(stackLayer(3));
  });

  it('throws cards alternately left and right', () => {
    expect(stackLayer(1).x).toBeLessThan(0);
    expect(stackLayer(2).x).toBeGreaterThan(0);
    expect(stackLayer(3).x).toBeLessThan(0);
    expect(stackLayer(4).x).toBeGreaterThan(0);
  });

  it('leans further, drops further and shrinks with depth', () => {
    for (let d = 1; d < STACK_DEPTH; d++) {
      expect(Math.abs(stackLayer(d + 1).rotate)).toBeGreaterThan(
        Math.abs(stackLayer(d).rotate)
      );
      expect(stackLayer(d + 1).y).toBeGreaterThan(stackLayer(d).y);
      expect(stackLayer(d + 1).scale).toBeLessThan(stackLayer(d).scale);
    }
  });

  it('shades everything behind the top card', () => {
    expect(stackLayer(1).shade).toBeGreaterThan(0);
    expect(stackLayer(STACK_DEPTH).shade).toBeGreaterThan(0);
  });

  // Deeper than the stack: parked at the deepest transform, invisible, so a
  // card fades in as the stack shortens rather than popping into existence.
  it('parks anything deeper than the stack at zero opacity', () => {
    const deep = stackLayer(STACK_DEPTH + 3);
    expect(deep.opacity).toBe(0);
    expect(deep.scale).toBe(stackLayer(STACK_DEPTH).scale);
    expect(deep.y).toBe(stackLayer(STACK_DEPTH).y);
  });

  it('clamps a negative depth to the top card', () => {
    expect(stackLayer(-2)).toEqual(stackLayer(0));
  });
});

describe('isPastThreshold', () => {
  const W = 400;

  it('commits past the distance threshold', () => {
    expect(isPastThreshold(W * SWIPE_THRESHOLD_RATIO + 1, 0, W)).toBe(true);
    expect(isPastThreshold(-(W * SWIPE_THRESHOLD_RATIO + 1), 0, W)).toBe(true);
  });

  it('does not commit below it', () => {
    expect(isPastThreshold(20, 0, W)).toBe(false);
  });

  it('commits on a hard flick regardless of distance', () => {
    expect(isPastThreshold(10, 1200, W)).toBe(true);
    expect(isPastThreshold(-10, -1200, W)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/ui/__tests__/dealtCardGeometry.test.ts`
Expected: FAIL — cannot find module `../dealtCardGeometry`.

- [ ] **Step 3: Implement the geometry**

Create `src/components/ui/dealtCardGeometry.ts`:

```ts
// Pure geometry for the dealt card and the deck behind it. No React, no
// Reanimated — so the numbers that decide how the thing looks can actually be
// tested, which nothing else about this feature can be (Reanimated 4 throws on
// import under Jest).

// How many cards are drawn behind the top one. Anything deeper is parked at
// the deepest transform with zero opacity, so it fades in as the stack
// shortens instead of appearing from nothing.
export const STACK_DEPTH = 4;

// Matches app/events/swipe.tsx exactly. Horizontal means the same thing on
// this card as it does on every other card in the app; two thresholds would be
// two different feels for one gesture.
export const SWIPE_THRESHOLD_RATIO = 0.28;
export const SWIPE_VELOCITY = 900;

export const DEAL_MS = 620;
export const DISMISS_MS = 380;
export const FLIP_MS = 460;
// Promoting the next card up one depth after a swipe. Not a deal — the card is
// already on screen.
export const PROMOTE_MS = 460;

export interface StackLayer {
  x: number;
  y: number;
  // degrees
  rotate: number;
  scale: number;
  opacity: number;
  // Opacity of the dark overlay laid over this card. React Native has no CSS
  // `filter`, so the "dimmer the further back" effect is a real View on top of
  // each card rather than a brightness filter.
  shade: number;
}

// The mess is a fixed table, not `Math.random()`. A random angle re-rolls on
// every re-render, so a card visibly twitches whenever something unrelated
// updates — and that reads as a rendering fault, not as charm. Nothing in the
// test suite or in `tsc` could catch it.
//
// Alternating sign is what makes it read as a hand someone put down rather
// than a fanned deck.
const LAYERS: readonly StackLayer[] = [
  { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, shade: 0 },
  { x: -6.8, y: 5, rotate: -4, scale: 0.96, opacity: 1, shade: 0.18 },
  { x: 8.8, y: 10, rotate: 5.25, scale: 0.92, opacity: 1, shade: 0.18 },
  { x: -10.8, y: 15, rotate: -6.5, scale: 0.88, opacity: 1, shade: 0.18 },
  { x: 12.8, y: 20, rotate: 7.75, scale: 0.84, opacity: 1, shade: 0.18 },
];

export function stackLayer(depth: number): StackLayer {
  if (depth <= 0) return LAYERS[0];
  if (depth <= STACK_DEPTH) return LAYERS[depth];
  return { ...LAYERS[STACK_DEPTH], opacity: 0 };
}

// Distance OR velocity, same as the swipe deck: a hard flick commits without
// travelling the full threshold.
export function isPastThreshold(
  dx: number,
  velocityX: number,
  width: number
): boolean {
  return (
    Math.abs(dx) > width * SWIPE_THRESHOLD_RATIO ||
    Math.abs(velocityX) > SWIPE_VELOCITY
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/ui/__tests__/dealtCardGeometry.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/components/ui/dealtCardGeometry.ts src/components/ui/__tests__/dealtCardGeometry.test.ts
git commit -m "feat(ui): stack and swipe geometry for the dealt card

A fixed table of angles, not Math.random(): a random angle re-rolls on
every re-render, so a card twitches when something unrelated updates and
reads as a rendering fault.

`shade` rather than a brightness filter — React Native has no CSS filter,
so the darkening behind the top card is an overlay View."
```

---

## Task 3: The join gate and the safety queue, extracted

This is an **extraction** from `EventBottomSheet.tsx:907-1042` and
`:854-899`. Read that code before writing; do not reconstruct the copy or the
flag names from this plan alone — the flag strings are persisted, and changing
one silently re-shows a popup someone already dismissed.

**Files:**
- Create: `src/utils/eventCardGates.ts`
- Test: `src/utils/__tests__/eventCardGates.test.ts`
- Read (do not modify yet): `src/components/events/EventBottomSheet.tsx`

**Interfaces:**
- Consumes: `EventDetail`, `Profile` from `@/types/models`; `isNewHost`, `isPartyActivity` from `@/services/safety`; `isPremium` from `@/utils/premium`; `CONFIG` from `@/constants/config`.
- Produces:
  - `interface QueuedSafetyPopup { flag: string; title: string; body: string | string[]; primaryLabel: string; icon?: IconName; accent?: string; tint?: string; secondaryLabel?: string }`
  - `type JoinGate = 'join' | 'request' | 'pending' | 'full' | 'womenOnly' | 'premiumDistance' | 'none'`
  - `joinGate(args): JoinGate`
  - `safetyFlagsFor(event: EventDetail): string[]`
  - `safetyPopup(flag: string, event: EventDetail): QueuedSafetyPopup | null`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/eventCardGates.test.ts`:

```ts
import { joinGate, safetyFlagsFor } from '../eventCardGates';
import { EventDetail } from '@/types/models';

const base = {
  id: 'e1',
  host_id: 'host',
  activity: 'padel',
  requires_approval: false,
  participant_count: 2,
  max_people: null,
  women_only: false,
  host: { created_at: '2020-01-01T00:00:00Z' },
} as unknown as EventDetail;

const ev = (o: Partial<EventDetail> = {}) => ({ ...base, ...o }) as EventDetail;

describe('joinGate', () => {
  const args = {
    event: ev(),
    isHost: false,
    isParticipant: false,
    isPending: false,
    premium: false,
    distanceM: null as number | null,
    viewerGender: 'female' as string | undefined,
  };

  it('offers a plain join by default', () => {
    expect(joinGate(args)).toBe('join');
  });

  it('offers a request when the event needs approval', () => {
    expect(joinGate({ ...args, event: ev({ requires_approval: true }) })).toBe(
      'request'
    );
  });

  it('reports a pending request', () => {
    expect(joinGate({ ...args, isPending: true })).toBe('pending');
  });

  it('reports a full event', () => {
    expect(
      joinGate({ ...args, event: ev({ max_people: 2, participant_count: 2 }) })
    ).toBe('full');
  });

  it('locks a women-only event for a non-female viewer', () => {
    expect(
      joinGate({ ...args, event: ev({ women_only: true }), viewerGender: 'male' })
    ).toBe('womenOnly');
  });

  it('does not lock a women-only event for its host', () => {
    expect(
      joinGate({
        ...args,
        event: ev({ women_only: true }),
        viewerGender: 'male',
        isHost: true,
      })
    ).toBe('none');
  });

  it('gates a distant event behind Mello+ for a free user', () => {
    expect(joinGate({ ...args, distanceM: 50_000 })).toBe('premiumDistance');
  });

  it('does not gate distance for a premium user', () => {
    expect(joinGate({ ...args, distanceM: 50_000, premium: true })).toBe('join');
  });

  // A pending request must still be cancellable from a distance — the gate is
  // on joining, not on getting out.
  it('reports pending even when far away', () => {
    expect(joinGate({ ...args, distanceM: 50_000, isPending: true })).toBe(
      'pending'
    );
  });

  it('has no join action for someone already in, or for the host', () => {
    expect(joinGate({ ...args, isParticipant: true })).toBe('none');
    expect(joinGate({ ...args, isHost: true })).toBe('none');
  });
});

describe('safetyFlagsFor', () => {
  it('always includes the first-join flag', () => {
    expect(safetyFlagsFor(ev())).toContain('first_join');
  });

  it('adds the women-only flag, scoped to the event', () => {
    expect(safetyFlagsFor(ev({ women_only: true }))).toContain(
      'women_event.e1'
    );
  });

  it('adds the new-host flag, scoped to the host', () => {
    const recent = new Date().toISOString();
    expect(
      safetyFlagsFor(ev({ host: { created_at: recent } } as Partial<EventDetail>))
    ).toContain('new_host.host');
  });

  it('adds the party flag for a party activity, scoped to the event', () => {
    expect(safetyFlagsFor(ev({ activity: 'drinks' }))).toContain('party.e1');
  });

  it('orders first_join before the rest', () => {
    const flags = safetyFlagsFor(ev({ women_only: true, activity: 'drinks' }));
    expect(flags[0]).toBe('first_join');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/utils/__tests__/eventCardGates.test.ts`
Expected: FAIL — cannot find module `../eventCardGates`.

- [ ] **Step 3: Implement the extraction**

Create `src/utils/eventCardGates.ts`. **Copy the popup copy verbatim from
`EventBottomSheet.tsx:951-1028`** — the strings and the flag names both. The
flags are persisted per user; renaming one re-shows a popup somebody already
dismissed, with no error to notice it by.

```ts
import { EventDetail } from '@/types/models';
import { isNewHost, isPartyActivity } from '@/services/safety';
import { CONFIG } from '@/constants/config';
import type { IconName } from '@/components/ui';

// A safety popup queued to show before a join goes through (spec #3/#5/#8/#10).
// Confirming one marks its flag seen and shows the next; the join fires only
// after the whole queue is confirmed. Dismissing cancels the join.
export interface QueuedSafetyPopup {
  flag: string;
  title: string;
  body: string | string[];
  primaryLabel: string;
  icon?: IconName;
  accent?: string;
  tint?: string;
  secondaryLabel?: string;
}

// What the primary action should offer. `none` = there is nothing to join
// (you are the host, or already in).
export type JoinGate =
  | 'join'
  | 'request'
  | 'pending'
  | 'full'
  | 'womenOnly'
  | 'premiumDistance'
  | 'none';

export function joinGate({
  event,
  isHost,
  isParticipant,
  isPending,
  premium,
  distanceM,
  viewerGender,
}: {
  event: EventDetail;
  isHost: boolean;
  isParticipant: boolean;
  isPending: boolean;
  premium: boolean;
  distanceM: number | null;
  viewerGender: string | undefined;
}): JoinGate {
  // Pending is checked before everything except membership: a request must
  // stay cancellable even when the event is full or out of range. The gate is
  // on joining, not on getting out.
  if (isHost || isParticipant) return 'none';
  if (isPending) return 'pending';

  // RLS already hides women-only events from non-female viewers; this is
  // client-side belt-and-braces for anything fetched by direct id.
  if (event.women_only && viewerGender !== 'female') return 'womenOnly';

  if (
    event.max_people != null &&
    (event.participant_count ?? 0) >= event.max_people
  ) {
    return 'full';
  }

  // Beyond the free radius, browsing is fine and joining needs Mello+.
  if (!premium && distanceM != null && distanceM > CONFIG.freeJoinRadiusMeters) {
    return 'premiumDistance';
  }

  return event.requires_approval ? 'request' : 'join';
}

// Which safety popups this event could raise, in the order they are shown.
// Whether each has actually been seen is a per-user lookup the caller does —
// this stays pure so the ordering and the scoping can be tested.
export function safetyFlagsFor(event: EventDetail): string[] {
  const flags = ['first_join'];
  if (event.women_only) flags.push(`women_event.${event.id}`);
  if (isNewHost(event.host?.created_at)) flags.push(`new_host.${event.host_id}`);
  if (isPartyActivity(event.activity)) flags.push(`party.${event.id}`);
  return flags;
}

// The copy for one flag. Returns null for a flag this event does not raise.
//
// Copy and flag names are lifted verbatim from EventBottomSheet — the flags
// are persisted per user, so a rename silently re-shows a popup someone
// already dismissed.
export function safetyPopup(
  flag: string,
  event: EventDetail
): QueuedSafetyPopup | null {
  if (flag === 'first_join') {
    return {
      flag,
      icon: 'parties',
      title: 'Nice — your first Mello 🎉',
      body: [
        'Meet in public the first time.',
        "Tell a friend where you're going.",
        "Check the host's profile and reviews.",
        'If anything feels off, leave and report — no explanation needed.',
      ],
      primaryLabel: 'Count me in',
    };
  }
  if (flag === `women_event.${event.id}`) {
    return {
      flag,
      icon: 'heart',
      accent: '#7C5CE0',
      tint: '#F0ECFC',
      title: 'A space for women',
      body:
        'This event is for women only. If anyone makes you ' +
        'uncomfortable you can leave, block and report — ' +
        "women's-safety reports are reviewed as a priority.",
      primaryLabel: 'Join',
    };
  }
  if (flag === `new_host.${event.host_id}`) {
    return {
      flag,
      icon: 'shieldAlert',
      accent: '#C8791E',
      tint: '#FBF0E2',
      title: 'A quick heads-up',
      body:
        "This host is fairly new to Mello. That's not necessarily a " +
        'problem — just take a little extra care: meet in public, bring ' +
        'a friend, and keep personal details to yourself.',
      primaryLabel: 'Got it, join anyway',
      secondaryLabel: 'View host profile',
    };
  }
  if (flag === `party.${event.id}`) {
    return {
      flag,
      icon: 'drinks',
      accent: '#D6478E',
      tint: '#FBE7F1',
      title: 'Have a great night — stay in control',
      body: [
        'Know your limit and plan your way home.',
        "Watch your drink — don't accept opened drinks.",
        'Consent always matters. "No" is a full answer.',
        'Look out for each other.',
      ],
      primaryLabel: 'Got it',
    };
  }
  return null;
}
```

**The accent/tint pairs must NOT stay as hex literals** — that collides with
the global "never hardcode a colour" constraint. The values are already in the
codebase (in `EventBottomSheet`) and must not change; name them in
`src/constants/colors.ts` and import them here:

```ts
  // Per-popup accents for the pre-join safety queue. Each popup is colour-
  // coded to what it is warning about, which is why these are not the brand
  // ramp: purple for the women-only space, amber for a new-host caution, pink
  // for the party/alcohol note. Values carried unchanged from the sheet these
  // popups used to live in.
  safetyWomen: '#7C5CE0',
  safetyWomenTint: '#F0ECFC',
  safetyCaution: '#C8791E',
  safetyCautionTint: '#FBF0E2',
  safetyParty: '#D6478E',
  safetyPartyTint: '#FBE7F1',
```

Then `accent: COLORS.safetyWomen, tint: COLORS.safetyWomenTint` and so on.
Add no colour literals beyond naming these six.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/utils/__tests__/eventCardGates.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npm run lint
git add src/utils/eventCardGates.ts src/utils/__tests__/eventCardGates.test.ts
git commit -m "refactor(events): extract the join gate and safety queue

Lifted from EventBottomSheet unchanged — copy and flag strings both. The
flags are persisted per user, so renaming one silently re-shows a popup
somebody already dismissed.

Pure, so the gate matrix and the queue's ordering get tests. That matrix
had six interacting conditions and no coverage at all."
```

---

## Task 4: `DealtCard` — the presentation primitive

**Files:**
- Create: `src/components/ui/DealtCard.tsx`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Consumes: `stackLayer`, `STACK_DEPTH`, `isPastThreshold`, `DEAL_MS`, `DISMISS_MS`, `FLIP_MS`, `PROMOTE_MS` from `./dealtCardGeometry`; `DealtOrigin` from `@/stores/uiStore`.
- Produces:

```ts
export interface DealtCardProps {
  // One entry per card in the deck, front to back. index 0 is face up.
  cards: { key: string; front: ReactNode; back: ReactNode }[];
  origin: DealtOrigin | null;
  onPass: () => void;
  onSave: () => void;
  onDismiss: () => void;
}
export function DealtCard(props: DealtCardProps): JSX.Element;
export const DEALT_CARD_WIDTH_RATIO = 0.78;
export const DEALT_CARD_ASPECT = 1.55;
```

- [ ] **Step 1: Build the component**

There is no test for this step — Reanimated 4 throws on import under Jest, and
everything testable about it already lives in `dealtCardGeometry.ts`. The
verification is the typecheck plus the device sheet in Task 10.

Create `src/components/ui/DealtCard.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions, Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/constants/colors';
import { RADIUS } from '@/constants/spacing';
import type { DealtOrigin } from '@/stores/uiStore';
import {
  DEAL_MS,
  DISMISS_MS,
  FLIP_MS,
  PROMOTE_MS,
  STACK_DEPTH,
  isPastThreshold,
  stackLayer,
} from './dealtCardGeometry';

export const DEALT_CARD_WIDTH_RATIO = 0.78;
export const DEALT_CARD_ASPECT = 1.55;

// How far the card lifts off the straight line between its origin and the
// centre, at the midpoint. This is what makes it an arc rather than a slide.
const ARC_LIFT = 26;
// The overshoot: it passes 3% past its resting size before settling. Cheap,
// and the difference between "a view appeared" and "an object landed".
const OVERSHOOT = 1.03;

// The card has no origin (a deep link, or a notification whose banner has
// already gone). It comes up off the bottom edge instead — a real motion
// rather than a shrug.
const NO_ORIGIN_ROTATE = -14;
const NO_ORIGIN_SCALE = 0.55;

function haptic(kind: 'land' | 'flip' | 'commit') {
  if (kind === 'land') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  else if (kind === 'flip') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else Haptics.selectionAsync();
}

/**
 * A card dealt out of whatever you tapped, landing centre screen over a dimmed
 * world, with the rest of its deck thrown messily behind it.
 *
 * Content-agnostic on purpose: it takes rendered faces and knows nothing about
 * what is on them. The community feed will deal something that is not an event.
 *
 * Gestures — tap flips, left/right pass and save at the same threshold the
 * swipe deck uses, down sends it home, up rubber-bands.
 */
export function DealtCard({
  cards,
  origin,
  onPass,
  onSave,
  onDismiss,
}: DealtCardProps) {
  const { width, height } = useWindowDimensions();
  const cardW = Math.round(width * DEALT_CARD_WIDTH_RATIO);
  const cardH = Math.round(cardW * DEALT_CARD_ASPECT);

  // 0 → at the origin, 1 → landed. Drives the deal, the dim and the dismiss.
  const deal = useSharedValue(0);
  // 0 → front, 1 → back.
  const flip = useSharedValue(0);
  // Live drag offsets on the top card.
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);

  // Where the card starts, relative to its landed position at screen centre.
  // With no origin it starts below the bottom edge instead.
  const startX = origin
    ? origin.x + origin.width / 2 - width / 2
    : 0;
  const startY = origin
    ? origin.y + origin.height / 2 - height / 2
    : height * 0.72;
  const startScale = origin
    ? Math.max(origin.width / cardW, origin.height / cardH, 0.08)
    : NO_ORIGIN_SCALE;
  const startRotate = origin ? -16 : NO_ORIGIN_ROTATE;

  useEffect(() => {
    deal.value = withTiming(1, {
      duration: DEAL_MS,
      easing: Easing.bezier(0.2, 0.7, 0.3, 1),
    });
  }, [deal]);

  // The landing thud, fired from the animation's own progress rather than a
  // setTimeout — a timer drifts from the frame the card actually settles on,
  // and a haptic that lands late feels like a different event.
  useAnimatedReaction(
    () => deal.value,
    (now, before) => {
      if (before != null && before < 0.9 && now >= 0.9) runOnJS(haptic)('land');
    }
  );

  // The click of the card going through edge-on.
  useAnimatedReaction(
    () => flip.value,
    (now, before) => {
      if (before == null) return;
      const crossed =
        (before < 0.5 && now >= 0.5) || (before > 0.5 && now <= 0.5);
      if (crossed) runOnJS(haptic)('flip');
    }
  );

  function sendHome() {
    deal.value = withTiming(
      0,
      { duration: DISMISS_MS, easing: Easing.bezier(0.5, 0, 0.75, 0.3) },
      (done) => {
        if (done) runOnJS(onDismiss)();
      }
    );
  }

  function commit(direction: 1 | -1) {
    haptic('commit');
    dx.value = withTiming(direction * width * 1.4, { duration: 300 }, (done) => {
      if (done) {
        dx.value = 0;
        dy.value = 0;
        flip.value = 0;
        runOnJS(direction === 1 ? onSave : onPass)();
      }
    });
  }

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      dx.value = e.translationX;
      // Up rubber-bands: it has no job, and letting it travel freely would
      // imply it does.
      dy.value = e.translationY < 0 ? e.translationY * 0.25 : e.translationY;
    })
    .onEnd((e) => {
      if (isPastThreshold(e.translationX, e.velocityX, width)) {
        runOnJS(commit)(e.translationX > 0 ? 1 : -1);
        return;
      }
      // A decisive downward drag sends it home.
      if (e.translationY > height * 0.18 || e.velocityY > 1100) {
        dx.value = withTiming(0, { duration: 160 });
        dy.value = withTiming(0, { duration: 160 });
        runOnJS(sendHome)();
        return;
      }
      dx.value = withTiming(0, { duration: 220 });
      dy.value = withTiming(0, { duration: 220 });
    });

  const tap = Gesture.Tap().maxDuration(400).onEnd(() => {
    flip.value = withTiming(flip.value > 0.5 ? 0 : 1, {
      duration: FLIP_MS,
      easing: Easing.bezier(0.5, 0.05, 0.2, 1),
    });
  });

  const gesture = Gesture.Exclusive(pan, tap);

  const dimStyle = useAnimatedStyle(() => ({
    opacity: deal.value * 0.8,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}
        onTouchEnd={sendHome}
      />
      <View style={styles.stage} pointerEvents="box-none">
        {/* Deepest first so DOM order paints correctly without z-index games. */}
        {cards
          .slice(0, STACK_DEPTH + 1)
          .map((c, depth) => ({ c, depth }))
          .reverse()
          .map(({ c, depth }) => (
            <CardLayer
              key={c.key}
              depth={depth}
              width={cardW}
              height={cardH}
              deal={deal}
              flip={flip}
              dx={dx}
              dy={dy}
              start={{ x: startX, y: startY, scale: startScale, rotate: startRotate }}
              front={c.front}
              back={c.back}
              gesture={depth === 0 ? gesture : null}
            />
          ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Add `CardLayer` in the same file**

One card at one depth. Only depth 0 takes gestures and flips; the rest are
scenery.

```tsx
function CardLayer({
  depth,
  width,
  height,
  deal,
  flip,
  dx,
  dy,
  start,
  front,
  back,
  gesture,
}: {
  depth: number;
  width: number;
  height: number;
  deal: Animated.SharedValue<number>;
  flip: Animated.SharedValue<number>;
  dx: Animated.SharedValue<number>;
  dy: Animated.SharedValue<number>;
  start: { x: number; y: number; scale: number; rotate: number };
  front: ReactNode;
  back: ReactNode;
  gesture: ReturnType<typeof Gesture.Exclusive> | null;
}) {
  const layer = stackLayer(depth);
  const isTop = depth === 0;

  const boxStyle = useAnimatedStyle(() => {
    // The deal interpolates from the origin to this layer's resting place, so
    // the whole stack arrives together rather than the top card arriving and
    // the rest appearing under it.
    const p = deal.value;
    const arc = interpolate(p, [0, 0.45, 1], [0, -ARC_LIFT, 0], Extrapolation.CLAMP);
    const scale =
      interpolate(p, [0, 0.82, 1], [start.scale, layer.scale * OVERSHOOT, layer.scale], Extrapolation.CLAMP);
    const rotate = interpolate(p, [0, 1], [start.rotate, layer.rotate], Extrapolation.CLAMP);
    const x = interpolate(p, [0, 1], [start.x, layer.x], Extrapolation.CLAMP);
    const y = interpolate(p, [0, 1], [start.y, layer.y], Extrapolation.CLAMP);

    return {
      opacity: layer.opacity * interpolate(p, [0, 0.12], [0.15, 1], Extrapolation.CLAMP),
      transform: [
        { translateX: x + (isTop ? dx.value : 0) },
        { translateY: y + arc + (isTop ? dy.value : 0) },
        {
          rotateZ: `${rotate + (isTop ? dx.value / 22 : 0)}deg`,
        },
        { scale },
      ],
    };
  });

  // Two faces, cross-faded at exactly edge-on rather than hidden with
  // `backfaceVisibility`. That property on a 3D-rotated view is inconsistent
  // on Android and fails by ghosting BOTH faces through each other — visible,
  // strange, and impossible to catch without the device.
  const spinStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${flip.value * 180}deg` },
    ],
  }));
  const frontStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 1 : 0,
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 0 : 1,
  }));

  const body = (
    <Animated.View
      style={[styles.card, { width, height }, boxStyle]}
      pointerEvents={isTop ? 'auto' : 'none'}
    >
      <Animated.View style={[StyleSheet.absoluteFill, isTop && spinStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.face, isTop && frontStyle]}>
          {front}
        </Animated.View>
        {isTop && (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.face,
              styles.backFace,
              backStyle,
            ]}
          >
            {back}
          </Animated.View>
        )}
      </Animated.View>
      {/* No CSS filter in React Native — the "dimmer further back" is a real
          overlay. Behind the top card only, so it never tints what you read. */}
      {layer.shade > 0 && (
        <View
          pointerEvents="none"
          style={[styles.shade, { opacity: layer.shade }]}
        />
      )}
    </Animated.View>
  );

  if (!gesture) return body;
  return <GestureDetector gesture={gesture}>{body}</GestureDetector>;
}

const styles = StyleSheet.create({
  dim: { backgroundColor: COLORS.ink },
  stage: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute',
    borderRadius: RADIUS['2xl'],
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.shadowWarm,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.42,
    shadowRadius: 30,
    elevation: 18,
  },
  face: { borderRadius: RADIUS['2xl'], overflow: 'hidden' },
  // The back face is counter-rotated so its content is not mirrored once the
  // container has turned 180°.
  backFace: { transform: [{ rotateY: '180deg' }] },
  shade: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS['2xl'],
    backgroundColor: COLORS.ink,
  },
});
```

- [ ] **Step 3: Export it**

In `src/components/ui/index.ts`, beside the other exports:

```ts
export { DealtCard, DEALT_CARD_WIDTH_RATIO, DEALT_CARD_ASPECT } from './DealtCard';
export type { DealtCardProps } from './DealtCard';
export { stackLayer, STACK_DEPTH } from './dealtCardGeometry';
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: 0 errors.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/DealtCard.tsx src/components/ui/index.ts
git commit -m "feat(ui): DealtCard — the deal, the dim, the stack and the flip

Content-agnostic: it takes rendered faces and knows nothing about events,
because community will deal something that is not one.

The flip cross-fades the two faces at exactly edge-on rather than using
backfaceVisibility. That property on a 3D-rotated view is inconsistent on
Android and fails by ghosting both faces through each other — visible,
strange, and invisible to tsc.

Haptics fire off the animation's own progress, not a setTimeout: a timer
drifts from the frame the card actually lands on, and a late thud reads
as a different event."
```

---

## Task 5: `EventCard` — the card object

**Files:**
- Create: `src/components/events/EventCard.tsx`
- Read for reference: `src/components/events/SwipeCard.tsx`, `src/components/ui/Glass.tsx`

**Interfaces:**
- Consumes: `Glass` (`tier="onPhoto"`), `Avatar`, `AttendeeStack`, `CategoryPill`, `Button`, `ActivityGlyph`, `IconButton` from `@/components/ui`; `eventImageUri` from `@/utils/events`; `formatEventWhen` from `@/utils/time`; `formatDistance` from `@/utils/distance`; `neighbourhood` from `@/utils/location`; `categoryStyle` from `@/constants/categoryStyle`.
- Produces:

```ts
export interface EventCardProps {
  event: EventDetail | NearbyEvent;
  // Only the top card of a dealt stack gets a real blurred pane; see below.
  blurred?: boolean;
  // The primary action. Omitted for the inline feed card, which is a tap
  // target rather than a surface with a CTA on it.
  action?: ReactNode;
  onSave?: () => void;
  onShare?: () => void;
  saved?: boolean;
}
export function EventCard(props: EventCardProps): JSX.Element;
```

- [ ] **Step 0: Add the two missing primitive props FIRST**

Both are "the primitive is close but missing something" cases. **Add the prop.
Do not fork, and do not hand-roll a substitute** (`AGENTS.md`).

**`Glass` needs `flat`.** Today it decides between blur and flat fill purely by
`Platform.OS === 'ios'`. A dealt stack renders five panes and only the top one
should pay for a real `BlurView`. Add:

```tsx
  // Force the Android flat-fill path on every platform. For a surface that is
  // shaded, rotated and mostly occluded — the cards behind the top of a dealt
  // stack — five stacked BlurViews is a real iOS cost for a difference nobody
  // can see.
  flat = false,
```
…and change the internal `supportsBlur` decision to `Platform.OS === 'ios' && !flat`.
Add `flat?: boolean` to the prop types. Existing callers are unaffected.

**`IconButton` needs an `onPhoto` variant.** Its current variants are
`'plain' | 'surface' | 'tint' | 'ghost'`; none is legible on a photo. Add
`'onPhoto'` to the union, rendering the smoked-glass chip
(`COLORS.glassOnPhoto` fill, `COLORS.glassBorderOnPhoto` hairline, white
glyph) — the same treatment `Glass`'s `onPhoto` tier gives a pane.

Verify with `npm run typecheck` before continuing to Step 1.

- [ ] **Step 1: Build the front face**

Face C from the design: full-bleed photo, a `Glass` `onPhoto` pane inset in the
lower third, category pill top-left, save/share top-right.

```tsx
import { type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { RADIUS, SPACING } from '@/constants/spacing';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { eventImageUri } from '@/utils/events';
import { formatEventWhen } from '@/utils/time';
import { formatDistance } from '@/utils/distance';
import { neighbourhood } from '@/utils/location';
import {
  ActivityGlyph,
  AttendeeStack,
  Avatar,
  CategoryPill,
  Glass,
  IconButton,
} from '@/components/ui';

// The card object — full-bleed photo with the content on a smoked-glass pane
// inset from the edges.
//
// The SAME component is the community feed's inline card and the front face of
// a dealt card. That is the point: the deal then reads as the thing you
// touched opening, rather than one surface being swapped for another.
//
// `blurred` exists because a dealt stack renders five of these at once. Only
// the top one gets a real BlurView; the four behind get the flat fill, since
// they are shaded, rotated and mostly occluded and five backdrop blurs is a
// genuine iOS cost for a difference nobody can see.
export function EventCard({
  event,
  blurred = true,
  action,
  onSave,
  onShare,
  saved,
}: EventCardProps) {
  const activity = ACTIVITY_MAP[event.activity];
  const cat = categoryStyle(event.activity);
  const imageUri = eventImageUri(event);
  const going = event.participant_count ?? 0;
  const spots =
    event.max_people != null ? Math.max(event.max_people - going, 0) : null;

  return (
    <View style={styles.card}>
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          recyclingKey={event.id}
        />
      ) : (
        <View style={[styles.fallback, { backgroundColor: cat.tint }]}>
          <ActivityGlyph activity={event.activity} size={72} color={cat.accent} />
        </View>
      )}

      <View style={styles.pill}>
        <CategoryPill
          emoji={activity?.emoji ?? '📍'}
          label={activity?.label}
          color={cat.accent}
        />
      </View>

      {(onSave || onShare) && (
        <View style={styles.chips}>
          {onSave && (
            <IconButton
              icon={saved ? 'bookmarkFilled' : 'bookmark'}
              onPress={onSave}
              variant="onPhoto"
              accessibilityLabel={saved ? 'Remove from wishlist' : 'Save to wishlist'}
            />
          )}
          {onShare && (
            <IconButton icon="share" onPress={onShare} variant="onPhoto" accessibilityLabel="Share" />
          )}
        </View>
      )}

      <Glass
        tier="onPhoto"
        radius={RADIUS.lg}
        shadow={false}
        style={styles.pane}
        // See Step 0. Android has no backdrop blur at all, so this only
        // changes anything on iOS — which is exactly where the cost is.
        flat={!blurred}
      >
        <View style={styles.hostRow}>
          <Avatar name={event.host_name ?? event.host?.name} photoUrl={event.host_photo_url ?? event.host?.photo_url} size={20} />
          <Text style={styles.hostText} numberOfLines={1}>
            {event.host_name ?? event.host?.name} is hosting
          </Text>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>

        <Text style={styles.meta} numberOfLines={1}>
          {[
            formatEventWhen(event.starts_at),
            event.location_name ? neighbourhood(event.location_name) : null,
            event.distance_m != null ? formatDistance(event.distance_m) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>

        <View style={styles.goingRow}>
          <AttendeeStack people={event.participants ?? []} count={going} max={3} size={20} />
          <Text style={styles.meta}>
            {going} going{spots != null ? ` · ${spots} spots` : ''}
          </Text>
        </View>

        {action}
      </Glass>
    </View>
  );
}
```

- [ ] **Step 2: Add the styles**

Colours from `COLORS`, fonts from `FONTS`, sizes from `TYPE_SIZE`. The pane's
inset is a one-off layout number and is fine to hardcode.

```tsx
const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: RADIUS['2xl'], overflow: 'hidden', backgroundColor: COLORS.surface },
  fallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', top: SPACING[2.5], left: SPACING[2.5] },
  chips: { position: 'absolute', top: SPACING[2.5], right: SPACING[2.5], flexDirection: 'row', gap: SPACING[1.5] },
  pane: {
    position: 'absolute',
    left: SPACING[2],
    right: SPACING[2],
    bottom: SPACING[2],
    padding: SPACING[3],
    gap: SPACING[2],
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1.5] },
  hostText: { flex: 1, fontFamily: FONTS.medium, fontSize: TYPE_SIZE.xs, color: COLORS.white, opacity: 0.85 },
  title: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.lg, lineHeight: TYPE_SIZE.lg * 1.2, letterSpacing: -0.2, color: COLORS.white },
  meta: { fontFamily: FONTS.regular, fontSize: TYPE_SIZE.xs, color: COLORS.white, opacity: 0.85 },
  goingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING[2] },
});
```

> `IconButton`'s `onPhoto` variant and `Glass`'s `flat` prop are added in Step 0. Do not fork
> it and do not hand-roll a chip. A missing prop is a five-minute fix; a fork is
> permanent (`AGENTS.md`). Same for `TYPE_SIZE` steps that do not exist.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors, no new warnings.

- [ ] **Step 4: Commit**

```bash
git add src/components/events/EventCard.tsx
git commit -m "feat(events): the event card object, face C

Full-bleed photo with the content on a smoked-glass onPhoto pane. The
same component is the community feed's inline card and the front face of
a dealt card, which is what makes the deal read as the thing you touched
opening rather than a swap.

`blurred` is off for the four cards behind the top one: five stacked
BlurViews is a real iOS cost for surfaces that are shaded, rotated and
mostly occluded."
```

---

## Task 6: `EventCardBack` — the reverse

**Files:**
- Create: `src/components/events/EventCardBack.tsx`
- Read for reference: `src/components/events/EventBottomSheet.tsx` (the who's-going card, the nearby rail, `NearbyMini`)

**Interfaces:**
- Consumes: `EventDetail`; `SectionLabel`, `Avatar`, `Tag`, `Button` from `@/components/ui`; `useNearbyEvents` from `@/hooks/useNearbyEvents`.
- Produces: `export function EventCardBack(props: { event: EventDetail; isMember: boolean; onOpenEvent: (id: string) => void; secondaryActions?: ReactNode }): JSX.Element`

- [ ] **Step 1: Build it**

A white face with a `ScrollView`: description, the roster, the nearby rail,
secondary actions. Port `NearbyMini` across from `EventBottomSheet.tsx:209-266`
verbatim — it is a self-contained presentational component with no dependency
on the sheet's drag axis.

Rules for this face:
- Non-members see the attendee stack plus "Join to see the full list of
  attendees", not a roster. Same gate the sheet had.
- The host sorts first in the roster (migration 043 gives them a participant
  row); keep the explicit pin from `EventBottomSheet.tsx:882-887` and its
  comment — server order is relied on, and a merge that reordered would put
  the Host tag on the wrong person.
- `ScrollView` needs `nestedScrollEnabled` and must not fight the card's pan
  gesture: give the pan `Gesture.Native()` blocking via
  `Gesture.Simultaneous` only on the front face. On the back, the card's pan is
  disabled entirely — vertical is scroll, and a tap returns to the front.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 3: Commit**

```bash
git add src/components/events/EventCardBack.tsx
git commit -m "feat(events): the card's reverse — description, roster, nearby

The host is pinned to the top of the roster explicitly, carried over from
the sheet along with the comment saying why: server order is relied on,
and a merge that reordered would silently put the Host tag on the wrong
person."
```

---

## Task 7: `useEventCard` and `EventDealtCard`

**Files:**
- Create: `src/hooks/useEventCard.ts`
- Create: `src/components/events/EventDealtCard.tsx`
- Modify: `app/(tabs)/_layout.tsx:39-69` (replace `GlobalEventSheet`)

**Interfaces:**
- Consumes: `joinGate`, `safetyFlagsFor`, `safetyPopup` from `@/utils/eventCardGates`; `useEventParticipation` from `@/hooks/useEventParticipation`; `hasSeenSafetyFlag`, `markSafetyFlagSeen` from `@/services/safety`; `DealtCard` from `@/components/ui`; `useUIStore`.
- Produces:
  - `useEventCard(eventId: string | null)` returning `{ event, isLoading, gate, primaryLabel, onPrimary, queue, confirmQueued, dismissQueue, saved, toggleSave, leave: {...} }`
  - `export function EventDealtCard(): JSX.Element | null`

- [ ] **Step 1: Write `useEventCard`**

It composes the pure gates from Task 3 with the existing mutations. It must
**not** re-implement `participationMutations` — call `useEventParticipation`.

The safety queue's sequencing, lifted from `EventBottomSheet.tsx:1030-1042`:
build the flag list with `safetyFlagsFor`, filter it by `hasSeenSafetyFlag`,
map through `safetyPopup`. Confirming marks the flag seen and pops; the join
fires only when the queue empties; dismissing clears the queue and cancels.

- [ ] **Step 2: Write `EventDealtCard`**

Reads `uiStore.dealtCard`, renders `<DealtCard>` with one entry per deck id.
Only the visible top card fetches its detail; the four behind render from
whatever the feed cache already has, so the stack costs no extra requests.

**The quota trap.** `onPass` and `onSave` come from the *opener*, not from
here. This component calls `advanceDealtCard()` plus the callbacks the opener
supplied. It must never import `useSwipeDeck`'s `swipe()`: that records a
permanent pass and spends one of ten daily free swipes, so wiring it here would
mean browsing the map quietly burns a user's quota — with no error, no type
failure and nothing in the tests that could catch it.

- [ ] **Step 3: Swap it into the tabs layout**

Replace `GlobalEventSheet` in `app/(tabs)/_layout.tsx`. Keep the
`StyleSheet.absoluteFill` + `pointerEvents="box-none"` wrapper and its comment:
the card lives above `<Tabs>` so it paints over the floating tab bar and its dim
covers the bar too.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test && npm run lint`
Expected: 0 type errors, all tests green, no new lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useEventCard.ts src/components/events/EventDealtCard.tsx "app/(tabs)/_layout.tsx"
git commit -m "feat(events): bind the dealt card to one event

onPass/onSave come from whoever opened the deck, never from here. Wiring
this to useSwipeDeck's swipe() would record a permanent pass and spend one
of ten daily free swipes, so browsing the map would quietly burn a user's
quota — with no error and nothing in the tests to catch it."
```

---

## Task 8: Call sites

Five openers. Each measures an origin and hands over a deck.

**Files:**
- Modify: `app/(tabs)/map.tsx:352`, `app/(tabs)/index.tsx`, `app/friends/[userId].tsx:580`, `app/events/wishlist.tsx:215`, `app/events/swipe.tsx:341`

- [ ] **Step 1: The map**

A `<Marker>`'s children cannot be measured with `measureInWindow` reliably.
`react-native-maps` gives the correct answer directly —
`mapRef.current.pointForCoordinate(latLng)` returns a `Promise<Point>` relative
to the MapView ([MapView.d.ts:693](../../node_modules/react-native-maps/dist/src/MapView.d.ts)).
Add the MapView's own window offset (measure the container once) and use the
pin's rendered size from `styles.pinBubble`.

```tsx
onPress={async () => {
  const p = await mapRef.current?.pointForCoordinate({
    latitude: event.lat,
    longitude: event.lng,
  });
  // The deck is the events currently on the map, this one first. Same query
  // the pins came from, so nothing extra is fetched.
  const ids = [event.id, ...clusters.flatMap((c) => c.items.map((i) => i.id)).filter((id) => id !== event.id)];
  dealCard(
    ids,
    0,
    p ? { x: p.x + mapOffset.x - PIN / 2, y: p.y + mapOffset.y - PIN / 2, width: PIN, height: PIN } : null
  );
}}
```

- [ ] **Step 2: The four card lists**

Home, friend profile, wishlist and the swipe deck all press a real view, so
they use `measureInWindow` on a ref around the card. The deck is that list, in
its displayed order, starting at the tapped index.

**The swipe deck is the exception** on pass/save: it passes its own
`swipe(eventId, direction)` through, because quota and permanent-pass are that
screen's contract. The other four pass `saveEvent`/advance-only.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/map.tsx" "app/(tabs)/index.tsx" "app/friends/[userId].tsx" app/events/wishlist.tsx app/events/swipe.tsx
git commit -m "feat: deal the event card from all five openers

The map uses pointForCoordinate rather than measureInWindow: a Marker's
children are not reliably measurable, and the map already knows where a
coordinate lands on screen.

Only the swipe deck passes its own swipe() through. Everywhere else, right
saves to the wishlist and left just advances — no quota, no permanent
pass."
```

---

## Task 9: Delete the sheet

**Files:**
- Delete: `src/components/events/EventBottomSheet.tsx`, `src/components/events/EventSheetStack.tsx`, `src/components/events/RevealingText.tsx`, `src/components/events/useEnterOnScroll.ts`
- Modify: `src/stores/uiStore.ts` (drop `selectedEventId` / `setSelectedEvent`), `package.json` (conditionally)

- [ ] **Step 1: Prove nothing imports them**

```bash
grep -rn "EventBottomSheet\|EventSheetStack\|RevealingText\|useEnterOnScroll\|selectedEventId\|setSelectedEvent" src app
```
Expected: no hits outside the files being deleted. Fix any that remain —
including `app/+native-intent.ts`, which routes deep links through
`selectedEventId` and must move to `dealCard(ids, 0, null)`.

- [ ] **Step 2: Check gorhom is genuinely unused**

```bash
grep -rn "@gorhom/bottom-sheet" src app
```
Only remove it from `package.json` if this returns nothing. The app's own
`Sheet`/`Dialog` are `Overlay`-based, but **verify rather than assume** — this
is exactly the kind of claim `AGENTS.md` says to measure.

- [ ] **Step 3: Delete and verify**

```bash
git rm src/components/events/EventBottomSheet.tsx src/components/events/EventSheetStack.tsx src/components/events/RevealingText.tsx src/components/events/useEnterOnScroll.ts
npm run typecheck && npm test && npm run lint
```

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(events): delete the event bottom sheet

2,216 lines plus its stack, RevealingText and useEnterOnScroll. All three
of those existed to solve problems the sheet created — a pinned CTA to
reveal text from behind, entrances driven by a drag axis that no longer
exists.

Deleted in the same branch rather than left running alongside the card.
Two ways to open an event is the failure mode AGENTS.md opens by warning
about."
```

---

## Task 10: The device test sheet

**Files:**
- Create: `docs/testing/dealt-event-card.md`
- Read for shape: `docs/testing/create-flow-refactor.md`

- [ ] **Step 1: Write it**

One row per check, ticked per platform, **ordered by risk rather than by
feature**, and marking explicitly which rows check *reasoning* rather than
something already observed. Highest risk first:

1. Flip framerate on Android over a full-bleed photo — *reasoning*
2. Swipe and scroll framerate with five cards mounted — *reasoning*
3. The glass pane's flat-fill degradation on Android — *reasoning*
4. Haptic timing: does the thud land on the frame the card settles?
5. Origin from a map marker while the map is mid-pan
6. A map-dealt right-swipe does **not** decrement `swipesLeft`
7. The deep-link fallback deals from the bottom edge
8. Dismiss returns to the pin on card 1, exits downward after any swipe
9. The safety queue still sequences and still fires the join only at the end
10. Android: nothing sits under the status bar (`SafeAreaView` is a no-op there)

- [ ] **Step 2: Commit**

```bash
git add docs/testing/dealt-event-card.md
git commit -m "docs: device test sheet for the dealt event card

Ordered by risk. Rows 1-3 check reasoning rather than something observed
— nothing in this feature is visible to tsc or to the test suite, and
Reanimated 4 throws under Jest, so the sheet is the only record of what
was and was not verified."
```

---

## Self-Review

**Spec coverage:** §2 components → Tasks 1, 4, 5, 6, 7. §3 motion and haptics → Task 4. §4 origins → Tasks 4 (fallback), 8 (measurement). §5 gestures → Task 4. §6 deck, stack and the quota trap → Tasks 2, 7, 8. §7 Android → Tasks 4, 5, 10. §8 deletion → Task 9. §9 verification → Tasks 1-3 (unit) and 10 (device). No gaps.

**Placeholders:** Tasks 6, 7 and 8 give rules and exact call-site edits rather than complete file bodies — those files are large, mostly ported from named line ranges in the existing sheet, and the constraints that matter (the roster pin, the non-member gate, the quota rule, `pointForCoordinate`) are stated explicitly with the reasons attached.

**Type consistency:** `DealtOrigin` (Task 1) is what `DealtCard.origin` (Task 4) takes and what Task 8 constructs. `stackLayer`/`STACK_DEPTH`/`isPastThreshold` (Task 2) are consumed only in Task 4. `joinGate`/`safetyFlagsFor`/`safetyPopup` (Task 3) are consumed only in Task 7. `EventCard`'s `blurred` (Task 5) is set by `DealtCard`'s depth in Task 7.
