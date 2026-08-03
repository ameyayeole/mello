# Create-Event Flow: Perf Pass and Decomposition

**Date:** 2026-08-03
**Scope:** Stage 0 (measure) → Stage 1 (perf) → Stage 2 (split)
**Status:** Design Approved

## Overview

`src/components/map/CreateEventFlow.tsx` is 1,813 lines — ~490 of logic, ~530 of
JSX, ~430 of `StyleSheet` — in **one component with 26 `useState` hooks**. It is
the app's main KPI surface, and three interactions in it drop frames on device:
panning to place the pin, stepping between steps, and opening the date/duration
pickers.

The root cause under all three is that 26 pieces of state in one component mean
any change re-renders everything. That cannot be fixed by memoisation discipline
— it decays the next time someone adds a field. It has to be structural: the
draft lives in a store, and each step subscribes only to the slice it reads.

Three helpers were already lifted out (`TypeGrid`, `SectionPills`,
`StepProgress`) plus `utils/eventDraft` and `utils/eventSchedule`. The pattern
exists; it stopped a third of the way in. This finishes it.

## Diagnosis

Derived from the code, to be confirmed by Stage 0 before any fix lands.

| Symptom | Cause | Evidence |
|---|---|---|
| Panning stutters | 3 full re-renders of a 530-line tree per pan-settle, plus map work continuing behind the overlay | `map.tsx:310` `setRegion` re-renders the unmemoised flow (`onExit` is an inline arrow); then the flow's own `setCoord`; then the debounced `setLocationName`. `useNearbyEvents` keeps refetching and markers keep rendering while faded out. |
| Step transitions stutter | 52 `onLayout` state writes, each spreading a new object, re-rendering 52 tiles — while the `FadeInDown` transition runs | `ACTIVITIES` has 52 entries; `TypeGrid.tsx:100-107` does `setFrames(f => ({...f, [id]: …}))` per tile |
| Pickers slow to open | 138 `Animated.View`s each with their own `useAnimatedStyle` worklet, mounted synchronously; ~90 re-evaluate per scroll frame | `Wheel.tsx:146` maps every option, no windowing. Starts sheet = `dayOptions` (90) + `timeOptions` (48). |

**Not a bug:** the submit sequence's `ZOOM_MS + PIN_DROP_MS + 250` = 1,620ms
floor plus a 1,300ms success hold — ~2.9s of deliberate ceremony. Changing it is
a design call, explicitly out of scope here.

## Stage 0 — Measure

AGENTS.md: *"Measure before you claim."* Two prior audits in this repo were
wrong. Numbers below get filled in before Stage 1 starts.

**Instrument A — dev-only render counter.** A `useRenderCount(name)` hook
logging per-component render counts, dropped into `CreateEventFlow`, `TypeGrid`,
and the step containers. Produces renders-per-pan-settle and
renders-on-entering-step-0 directly.

**Instrument B — Hermes sampling profiler.** Dev menu → JS debugger →
Performance. Capture tap → sheet-settled for the Starts picker. Gives the mount
cost of the 138 worklets in ms.

| Measurement | Before | After |
|---|---|---|
| `CreateEventFlow` renders per pan-settle | TBD | |
| `TypeGrid` renders on entering step 0 | TBD | |
| Starts-sheet open, tap → settled (ms) | TBD | |

**If a number contradicts the diagnosis, the plan changes before code is
written.**

## Stage 1 — Perf fixes

Four independent commits. Each is separately device-testable and bisectable —
AGENTS.md forbids mixing a refactor with a redesign, and the same logic applies
to mixing four unrelated fixes.

### 1a. Window the `Wheel`

`src/components/ui/Wheel.tsx`. `Animated.ScrollView` + `options.map` →
`Animated.FlatList` with `getItemLayout`, `initialScrollIndex`, `windowSize={3}`.
Mounted rows drop from 138 to ~15.

`WheelRow` is unchanged. Snapping (`snapToInterval`, `decelerationRate="fast"`),
the worklet-driven falloff, the throttled haptic tick, and both commit paths
(`onMomentumScrollEnd`, `onScrollEndDrag`) are ported verbatim. The
half-viewport `contentContainerStyle` padding stays.

This is a `ui/` primitive improvement, not a fork — the duration sheet and every
future caller get it too.

### 1b. Stop the map working behind the overlay

`app/(tabs)/map.tsx`. Pass `enabled: !creatingEvent` to `useNearbyEvents`, and
skip rendering markers while `creatingEvent`. The pins are already faded out;
this stops paying to render them.

### 1c. Memoise the flow

Wrap `CreateEventFlow` in `React.memo`; `useCallback` the `onExit` at
`map.tsx:392`. Without the stable callback the memo is a no-op. Removes one of
the three per-pan re-renders.

### 1d. Fix the `TypeGrid` measurement cascade

`src/components/map/create/TypeGrid.tsx`. Collect the 52 `onLayout` frames into
a ref and flush once, instead of 52 sequential object spreads. Also hoist
`stepEntering` / `stepExiting` out of `CreateEventFlow`'s render body to module
scope — they currently allocate fresh Reanimated builders every render.

Expected to move the step-transition feel most.

## Stage 2 — The split

### State

A zustand store at `src/stores/createEventStore.ts`, matching the existing
`authStore` / `locationStore` / `uiStore` convention.

**In the store (the draft):** `phase`, `step`, `coord`, `locationName`,
`activity`, `sectionFilter`, `title`, `description`, `photoUri`, `startDate`,
`durationH`, `maxPeople`, `isPublic`, `requiresApproval`, `womenOnly`, `cardH`.

The flow is a singleton — one map, one create flow — so a module-level store is
correct, but `reset()` must be an explicit action rather than implied by
unmount.

`sectionFilter` is UI-only and still belongs in the store: if it were local to a
step that unmounts, the category filter would silently reset every time you
stepped back to step 0. That is a behaviour change, not an optimisation.

**Local to their leaf:** `editingPeople`, `startOpen`, `durationOpen`,
`discardVisible`, `womenOnlyConfirmVisible`, `firstHostVisible`, `restored`,
`draftLoaded`.

### Files

```
src/components/map/create/
  CreateEventFlow.tsx      orchestrator + imperative ref (~200 lines)
  useCreatePin.ts          anchorY math, regionForAnchor, pin shared values, reverseGeocode
  useDraftPersistence.ts   restore-on-entry, debounced autosave, clear
  useHostSubmit.ts         two-beat choreography, createEvent, invalidation, failure path
  CreateCard.tsx           card shell: title row, StepProgress, restored row, Next
  CreatePin.tsx            pin overlay and its submit states
  LocationPill.tsx
  StartSheet.tsx
  DurationSheet.tsx
  DiscardDialog.tsx
  steps/StepType.tsx
  steps/StepDetails.tsx
  steps/StepWhen.tsx
  steps/StepPhoto.tsx
  steps/StepSafety.tsx
  TypeGrid.tsx  SectionPills.tsx  StepProgress.tsx  motion.ts   (existing)
```

### Two traps, both of which fail silently

1. **Stale imperative handlers.** The `useImperativeHandle` handlers close over
   `phase`. If they read a subscribed value they go stale and the map's taps hit
   the wrong branch. They must read `useCreateEventStore.getState()` inside the
   handler body.

2. **Dropped cache invalidation.** The success path fires four
   `invalidateQueries` calls (`CreateEventFlow.tsx:633-636`: `events`,
   `exploreFeed`, `myEvents`, `joinedEvents`). Losing one during the move
   produces no error — just a feed that stops updating. Explicit review
   checkpoint before the Stage 2 commit lands.

`cardH` is a third thing to watch: `anchorY` is computed from it, so when the
card moves into `CreateCard.tsx` the measurement has to flow back to the pin.
Keeping it in the store is what makes that work without prop-drilling a setter.

### Testing

Per AGENTS.md, component tests are not available (Reanimated 4 throws under
Jest), so logic gets extracted to be driven without a renderer — the
`participationMutations` pattern.

New coverage:
- store actions (reset, step advance, clamped people)
- the stored-draft → store hydration mapping
- the autosave payload builder

The restore path currently has no tests at all.

## Verification

Per stage:

```sh
npm run typecheck   # must stay at 0
npm test            # must stay green
npm run lint        # 95 errors / 16 warnings pre-existing; don't add
```

`tsc` passing does not mean the UI is right. Each stage also needs a device pass
on the three paths — **Android specifically**, per AGENTS.md, since
`react-native`'s `SafeAreaView` is a no-op there and that class of bug is
invisible on iOS.

Stage 0's render counter stays in (dev-only) through Stage 1 so the after-column
of the measurement table can be filled from the same instrument.

## Out of scope

- The ~2.9s submit ceremony (design decision, not a perf bug)
- The 90-day date window (windowing makes its cost moot)
- The ~500 one-off font sizes in screens — known, deliberate debt per CLEANUP.md
