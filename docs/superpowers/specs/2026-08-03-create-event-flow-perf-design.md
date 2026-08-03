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

### Results — and they changed the plan

Measured on device, pressing Create once:

```
[render] MapScreen #17
[render] CreateEventFlow #24
[render] TypeGrid #1
[render] CreateEventFlow #25
[Reanimated] Property "opacity" … may be overwritten by a layout animation
[render] Wheel(90) #1
[render] Wheel(48) #1
[Reanimated] Property "opacity" … may be overwritten by a layout animation
[render] Wheel(24) #1
[render] CreateEventFlow #26
[render] Wheel(90) #2
[render] Wheel(48) #2
[render] Wheel(24) #2
```

**Two predictions were wrong, and the measurement found something worse.**

1. **`TypeGrid` renders once, not 52 times.** React 19 batches the `onLayout`
   writes. Fix 1d was aimed at a problem that does not exist and would have
   measured no change. **Dropped.**

2. **All three picker wheels mount on pressing Create**, before any sheet is
   opened — then render a second time. `Modal` does *not* spare its children
   when `visible` is false; it reconciles them anyway. So entering create mode
   built 90 + 48 + 24 = **162 wheel rows, each with its own animated-style
   worklet**, for pickers nobody had touched. This is the reported stagger, and
   it was not in the original diagnosis at all.

3. **A real bug surfaced in the log**: `entering` and `scrimStyle` both drive
   `opacity` on one `Animated.View` in `Overlay`. The warning is the
   drag-to-lighten scrim losing to the fade-in. Affects every sheet in the app.

4. `CreateEventFlow` renders 3× on a single Create press — the memo fix (1c)
   still has something to bite on.

A second measurement, of one pin-drop plus a single map drag, gave the pan
numbers:

| Measurement | Before | After Stage 1 |
|---|---|---|
| Wheel rows mounted on pressing Create | 162, twice | **0** |
| `MapScreen` renders per pan | 5 | **3** |
| `TypeGrid` renders per pan | 9 *(= 468 tile renders)* | **4** |
| `TypeGrid` renders on entering step 0 | 1 | — *(never a problem)* |
| `CreateEventFlow` renders per Create press | 3 | 3 |
| `CreateEventFlow` renders per picker session | 32 | *(Stage 2)* |

The four `TypeGrid` renders that survive are its own 52 `onLayout` writes on
mount, which memo cannot touch and which happen once per entry to the step.

`CreateEventFlow` reaching 32 is the number Stage 1 could not fix, and the
reason Stage 2 exists: every wheel scroll and every keystroke called setState on
a component holding 26 fields, and the whole flow hung off it.

## Stage 1 — Perf fixes

Four independent commits. Each is separately device-testable and bisectable —
AGENTS.md forbids mixing a refactor with a redesign, and the same logic applies
to mixing four unrelated fixes.

### 1z. Don't mount overlay contents while shut — **done, `c05c871` + `a6645a5`**

Promoted to first because it is the largest win and the one actually reported.
It took two goes and a regression, and both are worth recording.

The first attempt returned `null` while `!mounted`. It did not work, and the
reason was a second bug underneath: the exit effect reads "not visible" as
"just closed", so on a first render with `visible={false}` and
`animation="slide"` it ran the dismissal path anyway. `setExiting(true)` is
half of `mounted`, so every slide Sheet in the app mounted its full contents on
first render in order to animate out of a state it had never been in. Guarded
on a `hasOpened` flag (`66bac74`).

The second attempt then broke closing: the sheet vanished, flashed back, and
went again. Gating the mount on `mounted` is not the same as gating it on "has
ever been opened" — `exiting` is set from an effect, so it is still false on the
render where `visible` first goes false, and that one render unmounted the
sheet before the effect remounted it to animate out. The guard now asks the
question it always meant to (`a6645a5`).

The lint rule was right twice here. `set-state-in-effect` was objecting to a
state write that ran on mount, which was exactly bug one; and it correctly
rejected `hasOpened` being set from an effect, which is derived state and
belongs in render.

Same work splits the scrim in two so `entering` and `scrimStyle` stop fighting
over `opacity`.

Blast radius is 26 callers. Safe on state: every caller declares its draft state
*above* its own `<Sheet>`, so unmounting the children cannot lose a half-typed
composer.

### 1a. ~~Window the `Wheel`~~ — **superseded**

Once the wheels stopped mounting on the Create press, the remaining cost was
three renders of a 90-row column per picker session. `memo` on `WheelRow` —
whose props cannot change once mounted — stops a parent re-render at the wheel
instead of reaching 90 children, which addresses the same cost without
converting a working `ScrollView` to a `FlatList`.

The caller had to be fixed for it to bite: the duration options were mapped
inline, and the day/time handlers closed over `startDate` so each wheel got a
new handler whenever the *other* one moved (`5d9d52d`).

Windowing remains the right answer if the option lists ever grow. At 90 rows it
is no longer the bottleneck.

### 1b. Stop the map working behind the overlay — **done, `1aae2e8`**

`useNearbyEvents` gains a `paused` option. The markers were **already** skipped
during create mode, so only the fetch and the 60s poll needed stopping — the
original plan over-stated this, and checking the render body first is what
caught it.

### 1c. Memoise the flow — **done, `1aae2e8`**

`memo` on `CreateEventFlow`, `TypeGrid` and `SectionPills`, plus a `useCallback`
`onExit`. Each needed its props stabilising first, or the memo would have been
decoration that failed silently.

Also: one selector per field in `map.tsx` instead of a bare `useUIStore()`,
which had subscribed the map screen to the whole store — it re-rendered when a
chat sheet opened on another tab.

### 1d. ~~Fix the `TypeGrid` measurement cascade~~ — **dropped**

Stage 0 measured `TypeGrid` at **1 render**, not 52. React 19 batches the
`onLayout` writes and the existing identity check in the updater already bails
out. There is nothing here to fix.

What survives is the trivial half: the step enter/exit builders move to module
scope so they stop allocating per render. Folded into `StepShell` in Stage 2.

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

### Files — as built (`faf5873`)

1,846 lines in one file became 635 plus eleven. The line count is not the
point; the **steps take no props** is the point, because that is what lets
`memo` hold them against a re-render of the flow.

```
src/stores/createEventStore.ts   the draft + both persistence mappings   224
src/components/map/
  CreateEventFlow.tsx            orchestrator, pin, imperative ref       635
  create/CreateCard.tsx          chrome + step switch + AdvanceButton    251
  create/StepShell.tsx           shared absolute-fill frame, enter/exit    32
  create/LocationPill.tsx        subscribes to locationName alone          73
  create/DiscardDialog.tsx                                                 95
  create/useDraftPersistence.ts  restore-on-entry, autosave, clear        102
  create/steps/StepType.tsx                                                68
  create/steps/StepDetails.tsx                                             86
  create/steps/StepWhen.tsx      both pickers live here                   374
  create/steps/StepPhoto.tsx                                              176
  create/steps/StepSafety.tsx                                             112
  create/{TypeGrid,SectionPills,StepProgress,motion}          (existing)
```

`useCreatePin` and `useHostSubmit` were **not** extracted. Both are tightly
bound to `anchorY` and the pin's shared values, which the orchestrator owns;
pulling them out would have meant passing four shared values and a region
helper across a boundary that buys nothing. The flow is a readable 635 lines
with them in place. Revisit if it grows again.

The autosave stopped being an effect and became a store subscription. As an
effect it needed all sixteen draft fields in its dependency array, which forced
the component to subscribe to all sixteen just to feed it — the exact coupling
the store exists to remove.

### Traps, all of which fail silently

1. **Stale imperative handlers.** The `useImperativeHandle` handlers close over
   `phase`. They read `useCreateEventStore.getState()` inside the handler body;
   a subscribed value would go stale and plant the event at the wrong
   coordinate. **Done.**

2. **Dropped cache invalidation.** Four `invalidateQueries` on success —
   `events`, `exploreFeed`, `myEvents`, `joinedEvents`. Losing one produces no
   error, just a feed that stops updating. **Verified present** by a mechanical
   diff of the old file against the new set, which also confirmed no
   accessibility label, service call or haptic was lost.

3. **The clamp on submit.** The first draft of the refactor wrote
   `Number(maxPeople) || undefined` in place of `clampMaxPeople`, which would
   have let an out-of-range party size reach the database — the same defect the
   edit screen once shipped. Caught before commit. This is the class of thing a
   1,800-line move buries.

4. **Exiting views need a mounted parent.** The phase check sits *inside*
   `CreateCard`'s `KeyboardAvoidingView`, not around the component. Unmounting
   the wrapper too makes the card vanish on submit instead of sliding away.

`cardH` lives in the store because `anchorY` is computed from it and the pin is
not inside the card — that is what avoids prop-drilling a setter back up.

### Testing

Per AGENTS.md, component tests are not available (Reanimated 4 throws under
Jest), so logic gets extracted to be driven without a renderer — the
`participationMutations` pattern.

New coverage — 15 tests, 296 total:
- store actions (reset, step clamping, the party-size stepper's bounds)
- both persistence mappings, in both directions
- day/time setters, including that they produce a new `Date` rather than
  mutating in place, since a subscriber comparing by reference would otherwise
  never see the change

The two mapping tests were checked by deleting a field from `draftInputFrom`
and confirming both fail. A test that cannot fail is worse than no test,
particularly for a mapping whose failure mode is a draft that silently forgets
one field.

## Verification

Per stage:

```sh
npm run typecheck   # must stay at 0
npm test            # must stay green
npm run lint        # baseline is 0 errors / 65 warnings; don't add
```

AGENTS.md still states the lint baseline as "95 errors / 16 warnings". That is
stale — it is 0 / 65 on `main`. Left alone here rather than folded into an
unrelated branch; worth its own commit.

`tsc` passing does not mean the UI is right. Each stage also needs a device pass
on the three paths — **Android specifically**, per AGENTS.md, since
`react-native`'s `SafeAreaView` is a no-op there and that class of bug is
invisible on iOS.

Stage 0's render counter stays in (dev-only) through Stage 1 so the after-column
of the measurement table can be filled from the same instrument.

## Out of scope

- ~~The ~2.9s submit ceremony~~ — was out of scope here (a design decision, not
  a perf bug) and changed separately afterwards: the floor is 1,800ms, it now
  applies to the failure path as well, and failure has a red X and a message
  instead of a native alert. See `feat/submit-failure-state`.
- The 90-day date window (windowing makes its cost moot)
- The ~500 one-off font sizes in screens — known, deliberate debt per CLEANUP.md
