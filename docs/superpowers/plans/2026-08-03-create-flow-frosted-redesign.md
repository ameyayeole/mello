# Create-Event Flow — Frosted Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the create-event wizard card as a single frosted pane — no black header block, no separate bands — with progress as a hairline and the step title as ordinary content.

**Architecture:** The card stops being an opaque white sheet with a solid `COLORS.accent` header stacked on top, and becomes one `<Glass tier="panel" edge="top">` pane. The `StepRing` SVG is replaced by a 2pt coral progress line across the pane's top edge. The step title moves into the body as left-aligned ink type. The hand-rolled 34×34 back chip becomes `NavButton`, which AGENTS.md already names as the primitive for back/close/dismiss.

**Tech Stack:** React Native, `expo-blur` via the existing `Glass` primitive, Reanimated 4.

## Global Constraints

- **Card surface is `Glass tier="panel"`** — light frosted, `rgba(255,255,255,0.68)` + `blur(28)` on iOS, flat `glassPanelSolid` (`rgba(255,255,255,0.86)`) on Android. Contents stay **ink**, never white (DESIGN.md §3: ink on the light tiers, white only on `onPhoto`).
- **`edge="top"`, `radius={32}`** — rounds the top corners only and draws the hairline across the top edge alone. The card runs off the bottom of the screen; a corner down there reads as the surface stopping short.
- **Category tints stay.** `categoryStyle(a.id)` on the type grid is unchanged. "More one colour" applies to the card surface and chrome, not to the type picker.
- **Coral stays in three places only:** the progress line, the selected-type accent (existing `categoryStyle`), and the primary `Next` button.
- **No new colour literals.** Every value comes from `COLORS`. The file was taken to zero literals in `0df2fe5`; it stays there.
- **No behaviour changes.** Draft persistence, the past-date guard, the discard prompt, `requestExit`, and the submit choreography all keep working exactly as they do now. This is appearance only — do not fold in logic changes, or a regression cannot be bisected to one or the other.
- `npm run typecheck` 0 errors · `npm test` 267 passing · `npm run lint` 0 errors.

---

### Task 1: Re-measure the pin anchor before touching layout

**Files:**
- Modify: `src/components/map/CreateEventFlow.tsx` (the `CARD_EST` constant)

**Why this is first:** `CARD_EST = 495` is a hardcoded estimate of the card's height, and it does not just describe the card — `anchorY` divides the leftover map strip by it to decide where the pin hangs, and `regionForAnchor()` uses that anchor to decide which coordinate is under the pin. Removing the black header sheet makes the card materially shorter. If `CARD_EST` is not corrected, the pin will hang too low and **the event will be created at the wrong coordinate**, silently. This is the one part of the redesign that can produce a data bug rather than a cosmetic one.

- [ ] **Step 1: Instrument the card's real height**

Add a temporary `onLayout` to the card's outer `Animated.View`:

```tsx
onLayout={(e) => console.log('CARD_H', e.nativeEvent.layout.height)}
```

- [ ] **Step 2: Record the height at each of the five steps**

Run on the simulator, walk steps 0→4, note all five logged heights. They differ — `stepArea` is a fixed 268 but the header and button padding are not.

- [ ] **Step 3: Set the constant to the tallest observed value**

`CARD_EST` should over-estimate rather than under-estimate: too large pushes the pin up into visible map, too small pushes it under the card where it cannot be seen.

```ts
// Measured, not guessed — see the note on anchorY. Tallest of the five steps,
// rounded up. Re-measure if the card's chrome changes again.
const CARD_EST = <measured>;
```

- [ ] **Step 4: Remove the temporary onLayout, then commit**

```bash
git add src/components/map/CreateEventFlow.tsx
git commit -m "fix(events): re-measure the card height the pin anchor derives from"
```

---

### Task 2: Replace StepRing with a hairline progress line

**Files:**
- Modify: `src/components/map/CreateEventFlow.tsx` — delete `StepRing`, `RING_SIZE`, `RING_STROKE`, `RING_R`, `RING_C`, `AnimatedCircle`, and the `Svg`/`Circle` imports if nothing else uses them
- Add: a `StepProgress` component in the same file

**Interfaces:**
- Consumes: `STEP_COUNT` from `@/utils/eventDraft`
- Produces: `<StepProgress step={number} />` — a 2pt bar, full card width, coral fill over an `inkFaint` track

- [ ] **Step 1: Write StepProgress**

Replaces the SVG ring. A plain animated `View` width — no `react-native-svg` needed, which drops a dependency from this file's import graph.

```tsx
const PROGRESS_H = 2;

// Progress as a hairline across the top edge of the pane rather than a ring in
// a header, because there is no header any more. Animated for the same reason
// the ring was: the fill moving is the main "you just finished that" feedback.
function StepProgress({ step }: { step: number }) {
  const pct = useSharedValue((step + 1) / STEP_COUNT);
  useEffect(() => {
    pct.value = withTiming((step + 1) / STEP_COUNT, {
      duration: 420,
      easing: Easing.out(Easing.cubic),
    });
  }, [step, pct]);
  const fill = useAnimatedStyle(() => ({ width: `${pct.value * 100}%` }));
  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, fill]} />
    </View>
  );
}
```

- [ ] **Step 2: Add its styles**

```ts
  // Sits flush in the pane's top edge — inside the radius, so the fill is
  // clipped to the rounded corner rather than crossing it.
  progressTrack: {
    height: PROGRESS_H,
    backgroundColor: COLORS.inkFaint,
    overflow: 'hidden',
  },
  progressFill: { height: PROGRESS_H, backgroundColor: COLORS.primary },
```

- [ ] **Step 3: Delete the ring**

Remove `StepRing` and its five module constants. Check whether `Svg` / `Circle` are still used anywhere in the file; if not, drop the `react-native-svg` import — the lint gate fails on unused imports.

- [ ] **Step 4: Verify and commit**

```bash
npm run typecheck && npm run lint
git commit -am "feat(events): replace the step ring with a hairline progress line"
```

---

### Task 3: Rebuild the card as one frosted pane

**Files:**
- Modify: `src/components/map/CreateEventFlow.tsx` — the card JSX and the `card` / `headerSheet` / `cardHeader` / `backSlot` / `backBtn` / `stepTitle` styles

**Interfaces:**
- Consumes: `Glass` and `NavButton` from `@/components/ui`, `StepProgress` from Task 2

- [ ] **Step 1: Replace the card shell**

The black `headerSheet` block goes entirely. The three-part header row (back · centred title · ring) becomes: progress line at the pane's top edge, then a back glyph, then the title as the first line of body content.

```tsx
<Glass tier="panel" radius={32} edge="top" style={styles.card}>
  <StepProgress step={step} />
  <View style={styles.cardBody}>
    <NavButton
      icon={step > 0 ? 'back' : 'close'}
      onPress={step > 0 ? back : requestExit}
      accessibilityLabel={step > 0 ? 'Previous step' : 'Cancel event creation'}
    />
    <Text style={styles.stepTitle}>{STEP_HEADS[step]}</Text>
    {/* … restored-draft row, stepArea, Next button unchanged … */}
  </View>
</Glass>
```

`NavButton`'s signature is `{ icon?: IconName; onPress?; color?; accessibilityLabel?; style? }`, and `color` already defaults to `COLORS.textPrimary` — which is what this card wants now that the dark band is gone, so do **not** pass `color`. Its own comment says the override exists only for dark headers.

- [ ] **Step 2: Restyle the shell**

```ts
  card: {
    paddingBottom: SPACING[7],
  },
  // Left-aligned and ink now that it is ordinary content rather than a label on
  // a dark band. Same size as before so the step-to-step rhythm is unchanged.
  stepTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.sectionLg,
    color: COLORS.textPrimary,
    marginTop: SPACING[2],
    marginBottom: SPACING[1],
  },
```

Delete `headerSheet`, `cardHeader`, `backSlot`, `backBtn`. `Glass` supplies the fill, the hairline and `SHADOWS.glass`, so the card's own `backgroundColor`, `shadowColor`, `shadowOpacity`, `shadowRadius`, `shadowOffset` and `elevation` all go with them.

- [ ] **Step 3: Confirm the shadow direction still reads**

The old card carried a deliberate upward shadow (`shadowOffset: { height: -8 }`) to lift it off the map. `SHADOWS.glass` is the design's standard downward one. Look at it on device: if the card's top edge stops separating from the map, keep a local upward shadow on the outer `style` — `Glass` puts `style` on the unclipped outer view precisely so this works.

- [ ] **Step 4: Verify and commit**

```bash
npm run typecheck && npm test && npm run lint
git commit -am "feat(events): rebuild the wizard card as one frosted pane"
```

---

### Task 4: Take the inner surfaces onto the ink ramp

**Files:**
- Modify: `src/components/map/CreateEventFlow.tsx` — styles only

**Why:** Several inner surfaces are filled with `COLORS.background` (`#F2F2F4`, an opaque page colour). That was invisible against an opaque white card. On a translucent pane an opaque grey block reads as a hole in the glass. They need to become tonal steps *of* the glass, which is also the "more one colour" the redesign is after.

- [ ] **Step 1: Move each fill onto the ramp**

| Style | Now | Becomes |
| --- | --- | --- |
| `input` | `COLORS.background` | `COLORS.inkFaint` |
| `sectionPill` | `COLORS.background` | `COLORS.inkFaint` |
| `photoEmpty` | `COLORS.background` | `COLORS.inkFaint` |
| `stepperBtn` | `COLORS.background` | `COLORS.inkSubtle` |
| `durChip` | check current value | `COLORS.inkFaint`, selected keeps coral |

`inkFaint` is `rgba(15,24,44,0.04)` — it darkens the glass slightly instead of covering it, so the field still reads as part of the pane.

- [ ] **Step 2: Check every text colour against the new backdrop**

Text was ink on white; it is now ink on frosted-white-over-map. `textPrimary` and `inkLabel` are fine. Anything at `textMuted` or lighter over a busy map area is the risk — check the character counter and `durSummary` specifically.

- [ ] **Step 3: Verify and commit**

```bash
npm run typecheck && npm run lint
git commit -am "refactor(events): take the card's inner surfaces onto the ink ramp"
```

---

### Task 5: Device pass

**Files:** none

- [ ] **Step 1: iOS — the wash-out check**

This is the known risk of choosing the light tier. Pan the map so the card sits over a **pale** area (sea, a large park, a zoomed-out light basemap). Panel glass is `rgba(255,255,255,0.68)`; over near-white it can flatten to a plain white box and stop reading as glass at all.

If it does: the hairline border is what DESIGN.md says keeps it reading as glass — confirm it is visible. If that is not enough, the fix is `tier="chrome"` (`0.72`, `blur(40)`), not a new literal.

- [ ] **Step 2: iOS — the rest**

- Progress line advances per step and is clipped by the top corners, not crossing them
- Back glyph and title are legible over dark map areas (roads, satellite)
- The card still slides in and out cleanly — a blur inside a `SlideInDown` is the one place this could stutter
- Keyboard still pushes the card correctly on the title and description steps

- [ ] **Step 3: Android — required**

Android gets the flat `glassPanelSolid` fallback, so it renders **differently by design**: no blur, a heavier `0.86` white. Confirm it still reads as a pane and that the hairline and shadow survive. Per AGENTS.md this is also where `SafeAreaView` bugs hide, and the card's bottom padding interacts with the nav bar.

- [ ] **Step 4: Pin accuracy — the Task 1 regression check**

Drop a pin on a known landmark, complete the flow, open the created event, confirm the location matches. This is what `CARD_EST` protects and the only failure here is silent.

---

## Out of scope

- The 1,380-line component split. It would collide with every task above and make regressions unbisectable. Worth doing, separately, afterwards.
- The type grid's per-category tints — kept, by decision.
- Any behaviour change to drafts, validation or submit.

## Risks

| Risk | Why | Mitigation |
| --- | --- | --- |
| **Wrong event coordinates** | `CARD_EST` feeds `anchorY` feeds `regionForAnchor` | Task 1 first, Task 5 step 4 verifies |
| Card washes out on a pale map | Light tier over light backdrop | Task 5 step 1; escalate to `chrome` tier |
| Android looks unlike iOS | No backdrop blur on Android, by design | Expected; verify it still reads as a pane |
| Blur stutters during the slide-in | Native blur inside an animated transform | Task 5 step 2; drop to `backdrop` compositing if needed |
