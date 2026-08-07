# Wrap Phase 2a — the contribution flow shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the four scattered wrap routes into **one flow** that ends by
writing a `wrap_contributions` row — the marker Phase 1 built the gate around.
Until this ships, nothing writes that row and every wrap stays locked until 48h.

**Architecture:** A `wrapFlowStore` (zustand) holds the step pointer; one file
per step under `src/components/wrap/flow/steps/`; a single route renders the
current step inside an animated frame. This is **exactly** the shape the create
wizard was refactored into (`createEventStore` + `map/create/steps/`), and
`AGENTS.md` makes that shape mandatory for this codebase — a wizard built from
`useState` in one file reached 1,846 lines and 26 hooks here once already.

**Tech Stack:** zustand, expo-router, Reanimated 4, TanStack Query v5, Jest.

## Global Constraints

- **Steps take NO props.** That is what lets `memo` hold them against the flow's
  re-renders. Adding one prop undoes it with no type error, no lint warning and
  no failing test — just the old behaviour back. (`AGENTS.md`)
- **A new field goes in `wrapFlowStore`, not a `useState`.** The store is what
  lets each step subscribe only to what it reads.
- Never hardcode a colour, font family or radius — `COLORS` / `FONTS` /
  `RADIUS` / `SPACING` / `TYPE_SIZE`.
- Never hand-type a query key — `src/constants/queryKeys.ts`.
- **No emoji in UI.** Icons come from `Icon`, which is backed by the real Solar
  set (`react-native-solar-icons`). Confirmed present in the installed package:
  `Like`, `Dislike`, `RewindBack`, `GalleryAdd`, `PenNewSquare`,
  `UsersGroupRounded`, `LockKeyhole`.
- **Do NOT modify `wrap_window_open()`** — 7 days, gates seven RLS policies.
- Reuse, don't fork: `StepShell` (`map/create/StepShell.tsx`) is the precedent
  for the step frame; `Screen`, `ScreenHeader`, `Button`, `Icon`, `Loader`.

**Depends on Phase 1** (`wrap_contributions` table, migration 074). Do not start
this until 074 is applied.

**On Tasks 5, 6 and 8 — these are moves, not rewrites.** Those tasks name a
source file and line range and ask for the body to be relocated into a step
component. They do not reprint the JSX, because transcribing ~400 lines into a
plan invites it to drift from the file it was copied out of, and the file is the
truth. The three things that must change during each move are stated explicitly:
read `eventId` from the store instead of route params, call `next()` instead of
`router.replace`, and take no props. Everything else should survive `git diff`
as a pure relocation — **if a move task produces behaviour changes, that is a
bug, not progress.**

**Out of scope — Phase 2b:** the 4:5 photo carousel, "leave a note" moved onto
the rating card, Skip above 15 people, thumbs-down reason chips and the `reports`
split, and the press-and-hold rewind. 2a moves the existing screens into the
flow **as they are**; 2b makes them feel like the approved prototype.

**Verification baseline:** `npm run typecheck` → 0 · `npm test` → green ·
`npm run lint` → 0 errors / 65 warnings pre-existing, do not add.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/components/ui/Icon.tsx` | register `thumbsDown` |
| `src/stores/wrapFlowStore.ts` | **new** — step pointer, nothing else |
| `src/stores/__tests__/wrapFlowStore.test.ts` | **new** — its tests |
| `src/services/wrap.service.ts` | `markWrapContributed` |
| `src/constants/queryKeys.ts` | nothing new — reuse `queryKeys.wrap` |
| `app/events/wrap/flow/[eventId].tsx` | **new** — the one route |
| `src/components/wrap/flow/FlowShell.tsx` | **new** — animated step frame + progress |
| `src/components/wrap/flow/steps/StepPhotos.tsx` | **new** — moved from the photos route |
| `src/components/wrap/flow/steps/StepRate.tsx` | **new** — rate + superlatives, merged |
| `src/components/wrap/flow/steps/StepRewind.tsx` | **new** — encore, with the live count |
| `src/components/wrap/flow/steps/StepFeedback.tsx` | **new** — moved, guests only |
| `src/components/wrap/flow/steps/StepDone.tsx` | **new** — writes the marker |
| `src/hooks/useWrap.ts` | `wrapStepsDone` / `wrapStepTotal` arithmetic |
| `src/components/wrap/WrapChecklist.tsx` | loses the awards row; photo count fixed |

---

### Task 1: Register the `thumbsDown` icon and delete the emoji

**Files:**
- Modify: `src/components/ui/Icon.tsx` (`SOLAR` map ~:84, `BOLD_DEFAULTS` ~:92)
- Modify: `app/events/wrap/rate/[eventId].tsx` (:162, :217, :223, :261, :279)
- Modify: `app/events/wrap/feedback/[eventId].tsx` (:92, :104)
- Modify: `app/(tabs)/chats/[eventId].tsx` (:734)

**Interfaces:**
- Produces: `IconName` gains `'thumbsDown'`.

This task is deliberately first and standalone: it touches no logic, so it can
be reviewed and shipped on its own.

- [ ] **Step 1: Register the glyph.** In `Icon.tsx`, in the `SOLAR` map directly
      below `thumbsUp: 'Like',`:

```ts
  thumbsDown: 'Dislike',
```

- [ ] **Step 2: Default it to bold.** In `BOLD_DEFAULTS`, add `'thumbsDown'`
      beside `'thumbsUp'`, so the pair render as a matched set:

```ts
  'crown', 'thumbsUp', 'thumbsDown', 'gps', 'crosshair',
```

- [ ] **Step 3: Verify the name typechecks.** Run `npm run typecheck` — 0 errors.
      Then confirm the union picked it up:

```bash
grep -n "thumbsDown" src/components/ui/Icon.tsx
```

Expected: two hits (the `SOLAR` entry and `BOLD_DEFAULTS`).

- [ ] **Step 4: Replace the rating stamps.** In
      `app/events/wrap/rate/[eventId].tsx`, replace each
      `<Text style={styles.stampEmoji}>👍</Text>` with:

```tsx
<Icon name="thumbsUp" size={30} color={COLORS.success} strokeWidth={2.4} />
```

and each `👎` with:

```tsx
<Icon name="thumbsDown" size={30} color={COLORS.error} strokeWidth={2.4} />
```

  Same substitution for the two action buttons (`styles.actionEmoji`, :261 and
  :279) at `size={26}`. Delete the now-unused `stampEmoji` / `actionEmoji`
  styles. Ensure `Icon` and `COLORS` are imported.

- [ ] **Step 5: Fix the header subtitle** at :162 — it currently spells the
      gesture with emoji:

```tsx
        subtitle={`Right up · left down (always private) · ${ratedCount}/${total} rated`}
```

  **Note:** "(always private)" becomes false in Phase 2b when reason chips can
  file a report. It is left alone here and rewritten in 2b — changing it now
  would describe behaviour that does not exist yet.

- [ ] **Step 6: Replace the feedback thumbs** at
      `app/events/wrap/feedback/[eventId].tsx:92` and `:104` with the same
      `<Icon name="thumbsUp" />` / `<Icon name="thumbsDown" />` at `size={26}`,
      and drop the `thumbEmoji` style.

- [ ] **Step 7: Replace the chat banner camera** at
      `app/(tabs)/chats/[eventId].tsx:734`:

```tsx
<Icon name="camera" size={18} color={COLORS.primary} />
```

  Drop the `wrapBannerEmoji` style.

- [ ] **Step 8: Verify no emoji remain in wrap UI**

```bash
grep -rn "👍\|👎\|📸" app/events/wrap/ src/components/wrap/ "app/(tabs)/chats/[eventId].tsx"
```

Expected: no output.

- [ ] **Step 9: Typecheck, test, lint, commit**

```bash
npm run typecheck && npm test && npm run lint
git add src/components/ui/Icon.tsx "app/events/wrap/rate/[eventId].tsx" \
        "app/events/wrap/feedback/[eventId].tsx" "app/(tabs)/chats/[eventId].tsx"
git commit -m "feat(wrap): a thumbsDown glyph, and no more emoji in the wrap"
```

---

### Task 2: `wrapFlowStore` — the step pointer

**Files:**
- Create: `src/stores/wrapFlowStore.ts`
- Test: `src/stores/__tests__/wrapFlowStore.test.ts`

**Interfaces:**
- Produces:
  - `type WrapFlowStep = 'photos' | 'rate' | 'rewind' | 'feedback' | 'done'`
  - `wrapFlowSteps(isHost: boolean): WrapFlowStep[]`
  - `useWrapFlowStore` with `{ step, eventId, start(eventId, isHost), next(), back(), reset() }`

The store holds **only navigation**. Each step's data stays in its own React
Query cache exactly as it does today — moving that into the store would be a
rewrite, not a move.

- [ ] **Step 1: Write the failing test.** Create
      `src/stores/__tests__/wrapFlowStore.test.ts`:

```ts
import { useWrapFlowStore, wrapFlowSteps } from '../wrapFlowStore';

const reset = () => useWrapFlowStore.getState().reset();
const s = () => useWrapFlowStore.getState();

describe('wrapFlowSteps', () => {
  it('gives a guest five steps, feedback second to last', () => {
    expect(wrapFlowSteps(false)).toEqual([
      'photos',
      'rate',
      'rewind',
      'feedback',
      'done',
    ]);
  });

  it('drops feedback for the host — they do not rate their own event', () => {
    expect(wrapFlowSteps(true)).toEqual(['photos', 'rate', 'rewind', 'done']);
  });
});

describe('useWrapFlowStore', () => {
  beforeEach(reset);

  it('starts on photos', () => {
    s().start('e1', false);
    expect(s().step).toBe('photos');
    expect(s().eventId).toBe('e1');
  });

  it('walks a guest through every step in order', () => {
    s().start('e1', false);
    const seen = [s().step];
    for (let i = 0; i < 4; i++) {
      s().next();
      seen.push(s().step);
    }
    expect(seen).toEqual(['photos', 'rate', 'rewind', 'feedback', 'done']);
  });

  it('skips feedback for a host', () => {
    s().start('e1', true);
    s().next();
    s().next();
    s().next();
    expect(s().step).toBe('done');
  });

  it('does not run off the end', () => {
    s().start('e1', true);
    for (let i = 0; i < 10; i++) s().next();
    expect(s().step).toBe('done');
  });

  it('does not run off the front', () => {
    s().start('e1', false);
    s().back();
    s().back();
    expect(s().step).toBe('photos');
  });

  it('goes back through the same list it came forward on', () => {
    s().start('e1', true);
    s().next();
    s().next();
    s().next();
    expect(s().step).toBe('done');
    s().back();
    expect(s().step).toBe('rewind');
  });

  it('clears itself on reset so a second event does not inherit a step', () => {
    s().start('e1', false);
    s().next();
    reset();
    expect(s().step).toBe('photos');
    expect(s().eventId).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/stores/__tests__/wrapFlowStore.test.ts --forceExit`
Expected: FAIL — `Cannot find module '../wrapFlowStore'`.

- [ ] **Step 3: Write the store.** Create `src/stores/wrapFlowStore.ts`:

```ts
import { create } from 'zustand';

// The contribution flow's step pointer, and nothing else.
//
// A store rather than useState in the route, for the reason AGENTS.md gives
// about the create wizard: steps that read the pointer from a store can be
// memoised and stop re-rendering each other. Every step here owns a gesture
// deck or an upload queue, so that is not a micro-optimisation.
//
// Step DATA deliberately stays in React Query where it already lives. This
// store knows where you are, never what you typed.
export type WrapFlowStep = 'photos' | 'rate' | 'rewind' | 'feedback' | 'done';

// The host never rates their own event, so `feedback` drops out of their flow —
// the same split `wrapStepTotal` already encodes as `isHost ? 3 : 4`.
export function wrapFlowSteps(isHost: boolean): WrapFlowStep[] {
  return isHost
    ? ['photos', 'rate', 'rewind', 'done']
    : ['photos', 'rate', 'rewind', 'feedback', 'done'];
}

interface WrapFlowState {
  step: WrapFlowStep;
  eventId: string | null;
  isHost: boolean;
  start: (eventId: string, isHost: boolean) => void;
  next: () => void;
  back: () => void;
  reset: () => void;
}

const INITIAL = {
  step: 'photos' as WrapFlowStep,
  eventId: null,
  isHost: false,
};

export const useWrapFlowStore = create<WrapFlowState>((set) => ({
  ...INITIAL,

  start: (eventId, isHost) => set({ ...INITIAL, eventId, isHost }),

  next: () =>
    set((s) => {
      const list = wrapFlowSteps(s.isHost);
      const i = list.indexOf(s.step);
      return { step: list[Math.min(i + 1, list.length - 1)] };
    }),

  back: () =>
    set((s) => {
      const list = wrapFlowSteps(s.isHost);
      const i = list.indexOf(s.step);
      return { step: list[Math.max(i - 1, 0)] };
    }),

  reset: () => set({ ...INITIAL }),
}));
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest src/stores/__tests__/wrapFlowStore.test.ts --forceExit`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/stores/wrapFlowStore.ts src/stores/__tests__/wrapFlowStore.test.ts
git commit -m "feat(wrap): a step pointer for the contribution flow"
```

---

### Task 3: `markWrapContributed` — the write the gate reads

**Files:**
- Modify: `src/services/wrap.service.ts`
- Modify: `src/hooks/useWrap.ts` (a mutation on the existing `useWrap`)

**Interfaces:**
- Consumes: `wrap_contributions` (Phase 1, migration 074).
- Produces:
  - `markWrapContributed(eventId, userId) => Promise<void>`
  - `useWrap(eventId).contribute` — a `useMutation` that invalidates the wrap key

- [ ] **Step 1: Add the service call.** In `src/services/wrap.service.ts`, below
      `getWrapGate`:

```ts
// Marks the whole contribution flow finished. This single row is what the gate
// counts (migration 075) — so it is written once, at the end, never per step.
// A duplicate is not an error: 23505 means you already contributed, which is
// the desired end state either way.
export async function markWrapContributed(
  eventId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('wrap_contributions')
    .insert({ event_id: eventId, user_id: userId });

  if (error && error.code !== '23505') throw error;
}
```

- [ ] **Step 2: Expose it as a mutation.** In `src/hooks/useWrap.ts`, add inside
      `useWrap` beside the existing `encore` mutation:

```ts
  // The flow's final act. Invalidation matters more than usual here: the gate's
  // contributor count lives on the same query, so skipping it leaves everyone
  // looking at a stale "waiting on N more people" after they just contributed.
  const contribute = useMutation({
    mutationFn: () => markWrapContributed(eventId!, user!.id),
    onSuccess: invalidate,
  });
```

  Add `contribute` to the object `useWrap` returns, and `markWrapContributed`
  to the existing import from `@/services/wrap.service`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/wrap.service.ts src/hooks/useWrap.ts
git commit -m "feat(wrap): mark the contribution flow complete"
```

---

### Task 4: The flow route and its step frame

**Files:**
- Create: `src/components/wrap/flow/FlowShell.tsx`
- Create: `app/events/wrap/flow/[eventId].tsx`

**Interfaces:**
- Consumes: `useWrapFlowStore`, `wrapFlowSteps`, `useWrap`, `getEventDetail`.
- Produces: route `/events/wrap/flow/{eventId}`; `<FlowShell>` frame.

At the end of this task the route renders, walks its steps and writes the
marker — with **placeholder step bodies**. Tasks 5–8 replace each body with the
real screen. This ordering means the navigation is proven before any screen is
moved into it.

- [ ] **Step 1: Build the frame.** Create
      `src/components/wrap/flow/FlowShell.tsx`:

```tsx
import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, FadeOut } from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { RADIUS, SPACING } from '@/constants/spacing';

// The frame every contribution step sits in. Copied in shape from
// map/create/StepShell.tsx: absolutely filled so an outgoing step and an
// incoming one overlap without the layout resizing between them.
//
// Module scope, not a render body — these are builder objects, and rebuilding
// them per render hands Reanimated a new animation identity every time.
const ENTERING = FadeInDown.duration(260)
  .easing(Easing.out(Easing.cubic))
  .withInitialValues({ transform: [{ translateY: 14 }] });
const EXITING = FadeOut.duration(120).easing(Easing.in(Easing.quad));

export function FlowProgress({ total, index }: { total: number; index: number }) {
  return (
    <View style={styles.rail}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.dot, i <= index && styles.dotOn]} />
      ))}
    </View>
  );
}

export function FlowShell({ children }: { children: ReactNode }) {
  return (
    <Animated.View entering={ENTERING} exiting={EXITING} style={styles.step}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  step: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  rail: {
    flexDirection: 'row',
    gap: SPACING[1.5],
    justifyContent: 'center',
    paddingVertical: SPACING[3],
  },
  dot: {
    height: 3,
    width: 32,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.inkFaint,
  },
  dotOn: { backgroundColor: COLORS.primary },
});
```

- [ ] **Step 2: Build the route.** Create `app/events/wrap/flow/[eventId].tsx`:

```tsx
import { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Loader, Screen, ScreenHeader } from '@/components/ui';
import { FlowProgress, FlowShell } from '@/components/wrap/flow/FlowShell';
import { useWrapFlowStore, wrapFlowSteps } from '@/stores/wrapFlowStore';
import { getEventDetail } from '@/services/events.service';
import { queryKeys } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';

// The contribution flow: photos, the people you met, rewind, how the event was.
// One route with a step pointer rather than four routes, so finishing feels
// like one journey and so a single `wrap_contributions` row can be written at
// the end — that row is what the gate counts (migration 075).
export default function WrapFlowScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const user = useAuthStore((s) => s.user);

  const step = useWrapFlowStore((s) => s.step);
  const start = useWrapFlowStore((s) => s.start);
  const reset = useWrapFlowStore((s) => s.reset);

  const eventQuery = useQuery({
    queryKey: queryKeys.eventDetail.of(eventId),
    queryFn: () => getEventDetail(eventId!),
    enabled: !!eventId,
  });
  const event = eventQuery.data;
  const isHost = !!event && !!user && event.host_id === user.id;

  // Start on mount, clear on unmount — otherwise opening a second event's flow
  // resumes wherever the first one was left.
  //
  // Depends on `event.id`, never on `event`. React Query hands back a new object
  // identity on every refetch, and a refetch mid-flow would re-run `start` and
  // throw the user back to step one. That failure needs a background refetch to
  // reproduce, so it will not show up while you are clicking through.
  const eventKey = event?.id;
  useEffect(() => {
    if (eventId && eventKey) start(eventId, isHost);
    return reset;
  }, [eventId, eventKey, isHost, start, reset]);

  const steps = useMemo(() => wrapFlowSteps(isHost), [isHost]);
  const index = steps.indexOf(step);

  if (eventQuery.isLoading || !event) {
    return (
      <Screen>
        <Loader inline />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Wrap it up"
        subtitle={event.title}
        backIcon="chevronDown"
        tone="transparent"
      />
      <FlowProgress total={steps.length} index={index} />
      <View style={{ flex: 1 }}>
        <FlowShell key={step}>
          {/* Replaced task by task — Tasks 5-8. */}
          <Text>{step}</Text>
        </FlowShell>
      </View>
    </Screen>
  );
}
```

  `ScreenHeader` already defaults its back action to `router.back()`
  (`src/components/ui/ScreenHeader.tsx:62`), so no `onBack` is needed here.
  `backIcon="chevronDown"` matches the other wrap screens — this is a flow you
  dismiss, not a page you came back from.

- [ ] **Step 3: Verify it renders and walks.** Start the app, open
      `/events/wrap/flow/<an event you attended>`. Expected: header, a progress
      rail of 4 dots (host) or 5 (guest), and the word `photos`.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/components/wrap/flow/FlowShell.tsx "app/events/wrap/flow/[eventId].tsx"
git commit -m "feat(wrap): one route for the contribution flow"
```

---

### Task 5: `StepPhotos`

**Files:**
- Create: `src/components/wrap/flow/steps/StepPhotos.tsx`
- Modify: `app/events/wrap/flow/[eventId].tsx`

**Interfaces:**
- Produces: `<StepPhotos />` — **no props** (see Global Constraints).

- [ ] **Step 1: Move the body.** Create `StepPhotos.tsx` as a `memo`'d component
      containing the picker, caption, tagging and upload logic currently in
      `app/events/wrap/photos/[eventId].tsx:40-102`. It reads `eventId` from
      `useWrapFlowStore((s) => s.eventId)` rather than route params, and its
      primary button calls `useWrapFlowStore.getState().next()` instead of
      `router.replace`.

```tsx
import { memo } from 'react';
import { useWrapFlowStore } from '@/stores/wrapFlowStore';

// No props — that is what lets memo hold this against the flow's re-renders.
// See AGENTS.md: adding a single prop undoes it with no error and no failing
// test, just the old behaviour back.
export const StepPhotos = memo(function StepPhotos() {
  const eventId = useWrapFlowStore((s) => s.eventId);
  const next = useWrapFlowStore((s) => s.next);
  // …picker / upload logic moved verbatim from the photos route…
  return null; // replaced by the moved JSX
});
```

  **Move, do not rewrite.** The 4:5 carousel is Phase 2b; this task preserves
  today's grid so any regression here is a move bug, not a design bug.

- [ ] **Step 2: Render it.** In the flow route, replace the placeholder:

```tsx
          {step === 'photos' ? <StepPhotos /> : null}
```

- [ ] **Step 3: Verify** on device: photos still pick, upload and tag; the
      button advances the rail to step 2.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/components/wrap/flow/steps/StepPhotos.tsx "app/events/wrap/flow/[eventId].tsx"
git commit -m "feat(wrap): photos as the flow's first step"
```

---

### Task 6: `StepRate` — the deck, with superlatives folded in

**Files:**
- Create: `src/components/wrap/flow/steps/StepRate.tsx`
- Modify: `app/events/wrap/flow/[eventId].tsx`

**Interfaces:**
- Consumes: `useWrapDeck`, `useWrap().vote`, `SUPERLATIVES`.
- Produces: `<StepRate />` — no props.

- [ ] **Step 1: Move the deck.** Move the gesture deck, stamps and undo from
      `app/events/wrap/rate/[eventId].tsx:41-175` into `StepRate.tsx`, `memo`'d
      and reading `eventId` from the store.

- [ ] **Step 2: Fold in the awards.** After the deck empties (`allDone`), render
      the four categories from `SUPERLATIVES` (`src/constants/superlatives.ts` —
      ids `mvp`, `first_to_arrive`, `next_host`, `best_vibes`) against the same
      `getCoAttendees` list the deck used, casting votes with `useWrap().vote`.

  Reuse the picker UI from `app/events/wrap/superlatives/[eventId].tsx:75+`
  rather than writing a second one.

  **Two things about this block:**

  **They are called "Awards" on screen, "superlatives" in the code.** Every
  user-facing string says Awards — the heading here, the checklist row, the
  recap section. The table, type, constants and RPC keep the old name; renaming
  `superlative_votes`, `SuperlativeCategory`, `SUPERLATIVES`, `SuperlativeBadge`,
  `voteSuperlative` and the `033` RPC to change a label is a large blast radius
  for zero user benefit. **Rename the strings, not the schema** (spec §5.2).

  **They are optional.** The step advances on the ratings alone — voting zero
  awards is a complete rating step. Do **not** gate `next()` on
  `myVotes.size >= SUPERLATIVES.length`. Four forced choices about who was most
  likely to host next is where people stop answering and start clicking, and a
  winner nobody meant is still displayed as a winner. A category already needs
  3+ votes to resolve (`033:140`), which only works if the votes are willing.

- [ ] **Step 3: Render it** — `{step === 'rate' ? <StepRate /> : null}`.

- [ ] **Step 4: Verify** on device: swipes still rate; undo works; all four
      superlatives can be cast; the step advances only when both are done.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/components/wrap/flow/steps/StepRate.tsx "app/events/wrap/flow/[eventId].tsx"
git commit -m "feat(wrap): rate people and vote the awards in one step"
```

---

### Task 7: `StepRewind`

**Files:**
- Create: `src/components/wrap/flow/steps/StepRewind.tsx`
- Modify: `app/events/wrap/flow/[eventId].tsx`

**Interfaces:**
- Consumes: `useWrap().encore`, `status.encoreCount`.
- Produces: `<StepRewind />` — no props.

- [ ] **Step 1: Build it.** A centred `Icon name="rewind"` (register
      `rewind: 'RewindBack'` in `Icon.tsx`'s `SOLAR` map — the component exists
      in the installed package), a primary button that calls
      `encore.mutate(true)`, and a tertiary "Skip". Both advance with `next()`.

  Show the live tally above the button — **rewind is public**:

```tsx
        <Text style={styles.count}>
          {status?.encoreCount
            ? `${status.encoreCount} ${
                status.encoreCount === 1 ? 'person wants' : 'people want'
              } to run it back`
            : 'Be the first to run it back'}
        </Text>
```

  `encore_requests_select` is `USING (is_event_attendee(...))`
  (`supabase/migrations/032_wrap.sql:464`), so every attendee can already read
  this — the count is not a leak, it is the point. **Never describe this step as
  private.**

- [ ] **Step 2: Render it** — `{step === 'rewind' ? <StepRewind /> : null}`.

  Press-and-hold is Phase 2b. A plain button here keeps the move honest.

- [ ] **Step 3: Verify** the count matches the wrap hub's own tally for the same
      event, and that Skip advances without writing an encore row.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/components/ui/Icon.tsx src/components/wrap/flow/steps/StepRewind.tsx \
        "app/events/wrap/flow/[eventId].tsx"
git commit -m "feat(wrap): rewind in the flow, with its public count"
```

---

### Task 8: `StepFeedback` and `StepDone` — the marker lands

**Files:**
- Create: `src/components/wrap/flow/steps/StepFeedback.tsx`
- Create: `src/components/wrap/flow/steps/StepDone.tsx`
- Modify: `app/events/wrap/flow/[eventId].tsx`

**Interfaces:**
- Consumes: `useWrap().feedback`, `useWrap().contribute` (Task 3), `status`.
- Produces: `<StepFeedback />`, `<StepDone />` — no props.

- [ ] **Step 1: Move feedback.** Port the thumbs + optional note from
      `app/events/wrap/feedback/[eventId].tsx:31-110` into `StepFeedback.tsx`,
      `memo`'d. The rating is required to advance; **the note is not** — asking
      twice for one opinion is how you get people typing "good" to get past a
      gate.

- [ ] **Step 2: Build Done, and write the marker.** Create `StepDone.tsx`:

```tsx
import { memo, useEffect, useRef } from 'react';
import { useWrapFlowStore } from '@/stores/wrapFlowStore';
import { useWrap } from '@/hooks/useWrap';

export const StepDone = memo(function StepDone() {
  const eventId = useWrapFlowStore((s) => s.eventId);
  const { status, contribute } = useWrap(eventId ?? undefined);
  const written = useRef(false);

  // Fires once. The ref guards a double-write when the query resolving
  // re-renders this step — the insert is idempotent (23505 is swallowed), but
  // a second request is still a second request.
  useEffect(() => {
    if (written.current || !eventId) return;
    written.current = true;
    contribute.mutate();
  }, [eventId, contribute]);

  const left = Math.max(
    0,
    (status?.contributorsNeeded ?? 0) - (status?.contributorCount ?? 0)
  );
  // …celebration + "waiting on N more people" + contributor faces…
  return null; // replaced by the JSX
});
```

- [ ] **Step 3: Render both** in the flow route.

- [ ] **Step 4: Verify the whole loop on device.** Walk the flow end to end,
      then open the wrap hub. Expected: your face appears in the contributor
      row and the count has gone up by one. **If the count is stale, the
      invalidation in Task 3 Step 2 is wrong** — that is the silent failure this
      whole phase turns on.

- [ ] **Step 5: Typecheck, test, lint, commit**

```bash
npm run typecheck && npm test && npm run lint
git add src/components/wrap/flow/steps/ "app/events/wrap/flow/[eventId].tsx"
git commit -m "feat(wrap): finishing the flow marks you a contributor"
```

---

### Task 9: Checklist arithmetic, and point the old routes at the flow

**Files:**
- Modify: `src/hooks/useWrap.ts` (:19-32)
- Modify: `app/events/wrap/[eventId].tsx` (`openStep`, ~:68)
- Modify: `src/components/wrap/WrapSheet.tsx` (`openStep`, :43)

**Interfaces:**
- Produces: `wrapStepTotal` returns `isHost ? 2 : 3`.

- [ ] **Step 1: Update both functions together.** In `src/hooks/useWrap.ts`:

```ts
// Photos, the people you met, and — guests only — how the event was.
//
// Rewind is deliberately absent: it is a preference, and a preference cannot be
// a required step. Awards are absent for the same reason (spec §5.2) — the old
// `votedCategories.length >= 4` clause is REMOVED, not moved. An optional thing
// that still gates completion is not optional.
export function wrapStepTotal(status: WrapStatus | undefined): number {
  return status?.isHost ? 2 : 3;
}

export function wrapStepsDone(status: WrapStatus | undefined): number {
  if (!status) return 0;
  let done = 0;
  if (status.myPhotoCount > 0) done += 1;
  if (status.coAttendeeCount > 0 && status.ratedCount >= status.coAttendeeCount)
    done += 1;
  if (!status.isHost && status.feedbackDone) done += 1;
  return done;
}
```

- [ ] **Step 1b: Fix the checklist to match.** `WrapChecklist`
      (`src/components/wrap/WrapChecklist.tsx`) builds its own list, independent
      of the two functions above — so leaving it alone gives you **four rows
      under a "2/3" summary**. Visibly wrong, no type error.

  - Narrow the type at `:11` — drop `'superlatives'`:

```ts
export type WrapStep = 'rate' | 'photos' | 'feedback';
```

  - Delete the whole `id: 'superlatives'` row from `buildSteps` (`:45-51`).
  - Rename the rate row's title to **"Rate the people you met"** (unchanged) and
    fold the awards into its subtitle only if you want them mentioned at all —
    they are optional, so the checklist should not imply otherwise.
  - Fix the photos row's stale subtitle at `:43`: it says
    `'Up to 4 · top 6 go to Explore'`, and Phase 2b's carousel has **five**
    slots. Make it `'Up to 5 · top 6 go to Explore'`.

  `WrapSheet` renders this same component, so both surfaces are fixed by this
  one edit.

  **All three of these must change together** — the two functions and the
  checklist. Any one alone leaves the hub disagreeing with itself.

- [ ] **Step 2: Send the old entry points to the flow.** In
      `app/events/wrap/[eventId].tsx` and `src/components/wrap/WrapSheet.tsx`,
      replace the bodies of `openStep` with a single push:

```tsx
  function openStep() {
    if (!eventId) return;
    router.push(`/events/wrap/flow/${eventId}`);
  }
```

  Leave the four old routes in place — they are still reachable by deep link and
  deleting them is a separate, riskier change.

- [ ] **Step 3: Run the Phase 1 gate tests.** The arithmetic feeds
      `wrapGateState`:

Run: `npx jest src/utils/__tests__/wrapGate.test.ts --forceExit`
Expected: PASS, 10 tests. If `is host-aware: a host with no feedback is still
done` now fails, the `isHost` branch above is wrong.

- [ ] **Step 4: Typecheck, test, lint, commit**

```bash
npm run typecheck && npm test && npm run lint
git add src/hooks/useWrap.ts src/components/wrap/WrapChecklist.tsx \
        "app/events/wrap/[eventId].tsx" src/components/wrap/WrapSheet.tsx
git commit -m "feat(wrap): three steps, and every door opens the flow"
```

---

### Task 10: The device test sheet

**Files:**
- Create: `docs/testing/wrap-flow-phase-2a.md`

- [ ] **Step 1: Write the sheet**

```markdown
# Wrap contribution flow (Phase 2a) — device sheet

Phase 1 migrations 074 + 075 must be applied. Tick per platform.
⚠️ rows check reasoning rather than an observed bug — those are worth the time.

## 1. The marker (the whole point — everything else is cosmetic)
| | iOS | Android |
|---|---|---|
| ⚠️ Finishing the flow adds you to the hub's contributor row **immediately** | | |
| ⚠️ Running the flow twice does not double-count you | | |
| ⚠️ Abandoning mid-flow writes nothing — you are not a contributor | | |
| ⚠️ Enough people finishing flips the recap from locked to open with no reload | | |

## 2. Step navigation
| | iOS | Android |
|---|---|---|
| Guest sees 5 dots; host sees 4 | | |
| ⚠️ Host never reaches the feedback step | | |
| Back from step 1 leaves the flow | | |
| ⚠️ Leaving and reopening starts at photos, not where you left off | | |
| ⚠️ Opening a *different* event's flow does not resume the first one's step | | |

## 3. Moved screens still work
| | iOS | Android |
|---|---|---|
| Photos pick, upload, tag | | |
| Deck swipes, stamps, undo | | |
| Awards castable, labelled **Awards** not "superlatives" | | |
| ⚠️ Voting **zero** awards still completes the rating step | | |
| ⚠️ Hub checklist shows 3 rows (guest) / 2 (host) — no awards row | | |
| ⚠️ Checklist summary count matches the number of rows shown | | |
| Photos row reads "Up to 5", not "Up to 4" | | |
| Rewind writes an encore; Skip does not | | |
| ⚠️ Rewind's count matches the hub's for the same event | | |
| Feedback advances on a rating alone, with no note | | |

## 4. Icons
| | iOS | Android |
|---|---|---|
| Thumbs up/down render as Solar glyphs, no emoji anywhere | | |
| ⚠️ Both thumbs are the same weight (both in BOLD_DEFAULTS) | | |

## 5. Android-specific
| | Android |
|---|---|
| ⚠️ Step transitions do not flash white between steps | |
| ⚠️ The gesture deck still works inside the flow's frame | |
```

- [ ] **Step 2: Commit**

```bash
git add docs/testing/wrap-flow-phase-2a.md
git commit -m "docs(wrap): device sheet for the contribution flow"
```

---

## Verification

- `npm run typecheck` → 0
- `npm test` → green (9 new tests in `wrapFlowStore.test.ts`; Phase 1's 10 still pass)
- `npm run lint` → 0 errors, no new warnings
- No emoji remain in wrap UI (Task 1 Step 8)
- The device sheet is filled in, or its gaps stated plainly

## What can break silently

1. **A step given a prop.** `memo` stops holding, every step re-renders on every
   store change, and the gesture deck starts dropping frames. No error, no test.
2. **`wrapStepsDone`, `wrapStepTotal` and `WrapChecklist` drifting apart** — a
   checklist that never completes, completes early, or shows more rows than its
   own summary counts. All three changed together in Task 9.
3. **Missing invalidation after `markWrapContributed`** — the contributor count
   sticks and the wrap looks locked to someone who just contributed.
4. **`reset` dropped from the route's unmount** — a second event's flow resumes
   the first one's step.
5. **`StepDone` writing more than once** — idempotent at the DB, still a wasted
   round trip and a doubled invalidation.

## Out of scope

Phase 2b: the 4:5 carousel, note-on-card, Skip above 15 people, thumbs-down
reason chips and the `reports` split, press-and-hold rewind.
Phase 3: the launch dealt card and the turn, the chat pin, Home variants.
