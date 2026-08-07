# Wrap Phase 3 — the surfaces

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the wrap where people will find it — one dealt-card moment at app
launch that turns into the flow, a permanent pin in the event chat, and a Home
treatment chosen on a device rather than in a browser.

**Architecture:** No new data model. The launch card composes the existing
`DealtCard` primitive and the existing `seenFlags` store; the chat and Home
surfaces already ship and are edited in place.

**Tech Stack:** Reanimated 4, expo-router, expo-secure-store, TanStack Query v5.

## Global Constraints

- Never hardcode a colour, font family or radius — `COLORS` / `FONTS` /
  `RADIUS` / `SPACING` / `TYPE_SIZE`.
- Never hand-type a query key — `src/constants/queryKeys.ts`.
- **No emoji.** `Icon` is backed by `react-native-solar-icons`.
- **One CTA phrase: "Wrap it up"**, on the card's face — not a button beneath
  it. It becomes **"View wrap"** once you have contributed. Same phrase on the
  launch card, the chat pin and the Home card, so it means one thing.
- **Do NOT write a new SecureStore key format.** `src/services/seenFlags.ts`
  already does per-user, per-entity "has this been shown", with the key
  sanitising and fail-open try/catch solved. Use it.
- Reuse, don't fork: `DealtCard`, `EventDealtCard` (as the mounting precedent),
  `Glass`, `AttendeeStack`, `WrapEntryCard`, `WrapCard`.

**Depends on Phases 1, 2a and 2b.** The launch card's CTA opens the flow that
2a builds.

**Verification baseline:** `npm run typecheck` → 0 · `npm test` → green ·
`npm run lint` → 0 errors / 65 warnings pre-existing, do not add.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/services/seenFlags.ts` | unchanged — reused for the deal flag |
| `src/hooks/useWrapDeal.ts` | **new** — should the card deal, and marking it dealt |
| `src/hooks/__tests__/useWrapDeal.test.ts` | **new** — the eligibility rule, as a pure function |
| `src/components/wrap/WrapDealtCard.tsx` | **new** — the launch card, root-mounted |
| `app/_layout.tsx` | mount it beside `EventDealtCard` |
| `app/(tabs)/chats/[eventId].tsx` | pin upgrade; auto-open removed |
| `src/components/wrap/WrapEntryCard.tsx` | Home variant A |
| `src/components/wrap/WrapRail.tsx` | **new** — Home variant B |
| `app/(tabs)/index.tsx` | render whichever variant is being trialled |

---

### Task 1: Should the card deal? — the rule, and its tests

**Files:**
- Create: `src/utils/wrapDeal.ts`
- Test: `src/utils/__tests__/wrapDeal.test.ts`

**Interfaces:**
- Produces:
  - `DEAL_WINDOW_HOURS = 48`
  - `shouldDealWrap(args: { hoursSinceEnd: number; alreadyDealt: boolean; hasContributed: boolean }): boolean`

Extracted as a pure function for the same reason as `wrapGate.ts`: there is no
component-test setup here (Reanimated 4 throws under Jest), so a rule that
matters has to live outside a renderer to be tested at all.

- [ ] **Step 1: Write the failing test.** Create
      `src/utils/__tests__/wrapDeal.test.ts`:

```ts
import { shouldDealWrap } from '../wrapDeal';

const a = (o: Partial<Parameters<typeof shouldDealWrap>[0]> = {}) => ({
  hoursSinceEnd: 2,
  alreadyDealt: false,
  hasContributed: false,
  ...o,
});

describe('shouldDealWrap', () => {
  it('deals just after the event ends', () => {
    expect(shouldDealWrap(a())).toBe(true);
  });

  it('never deals twice', () => {
    expect(shouldDealWrap(a({ alreadyDealt: true }))).toBe(false);
  });

  it('does not deal to someone who already contributed', () => {
    expect(shouldDealWrap(a({ hasContributed: true }))).toBe(false);
  });

  it('does not deal before the event has ended', () => {
    expect(shouldDealWrap(a({ hoursSinceEnd: -3 }))).toBe(false);
  });

  it('still deals at the edge of the window', () => {
    expect(shouldDealWrap(a({ hoursSinceEnd: 47 }))).toBe(true);
  });

  it('stops dealing once the window has closed', () => {
    expect(shouldDealWrap(a({ hoursSinceEnd: 49 }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/utils/__tests__/wrapDeal.test.ts --forceExit`
Expected: FAIL — `Cannot find module '../wrapDeal'`.

- [ ] **Step 3: Write it.** Create `src/utils/wrapDeal.ts`:

```ts
// How long after an event the launch card will still deal itself.
//
// The same 48 hours as the force-unlock clock, and for the same reason: this is
// the window in which the wrap is a live thing rather than a memory. It is NOT
// the contribution window — contributing stays open seven days
// (`wrap_window_open`, migration 032).
export const DEAL_WINDOW_HOURS = 48;

// Whether to deal the wrap card on this app open.
//
// Deliberately narrow. This is the app's one uninvited full-screen moment, so
// every clause here is a reason NOT to show it: already seen, already done,
// too early, too late.
export function shouldDealWrap(args: {
  hoursSinceEnd: number;
  alreadyDealt: boolean;
  hasContributed: boolean;
}): boolean {
  if (args.alreadyDealt) return false;
  // Nothing to invite them to — they have already wrapped this one.
  if (args.hasContributed) return false;
  if (args.hoursSinceEnd < 0) return false;
  return args.hoursSinceEnd < DEAL_WINDOW_HOURS;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest src/utils/__tests__/wrapDeal.test.ts --forceExit`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/wrapDeal.ts src/utils/__tests__/wrapDeal.test.ts
git commit -m "feat(wrap): the rule for when the launch card deals"
```

---

### Task 2: `useWrapDeal` — eligibility plus the seen-flag

**Files:**
- Create: `src/hooks/useWrapDeal.ts`

**Interfaces:**
- Consumes: `useWrapEntry` (`src/hooks/useWrap.ts:124`), `useWrap`,
  `hasSeenFlag` / `markFlagSeen` (`src/services/seenFlags.ts`),
  `shouldDealWrap` (Task 1).
- Produces: `useWrapDeal() => { event, ready: boolean, dismiss: () => void }`

- [ ] **Step 1: Write the hook**

```ts
import { useEffect, useState } from 'react';
import { hasSeenFlag, markFlagSeen } from '@/services/seenFlags';
import { useAuthStore } from '@/stores/authStore';
import { shouldDealWrap } from '@/utils/wrapDeal';
import { useWrap, useWrapEntry } from './useWrap';

// Whether to deal the wrap card on this app open, and how to stop it dealing
// again.
//
// The "already dealt" flag goes through `seenFlags` rather than a new
// SecureStore key: that module already solved key sanitising, per-user
// namespacing and failing open on a keychain read error. A second
// implementation of the same format is the kind of duplication that drifts —
// one side gets a try/catch and the other does not.
const SCOPE = 'wrapDeal';

export function useWrapDeal() {
  const user = useAuthStore((s) => s.user);
  const { data: event } = useWrapEntry();
  const { status } = useWrap(event?.id);

  const [dealt, setDealt] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user || !event) return;
    let live = true;
    hasSeenFlag(SCOPE, user.id, event.id).then((seen) => {
      if (live) setDealt(seen);
    });
    return () => {
      live = false;
    };
  }, [user, event]);

  // `dealt === null` means the flag has not been read yet. Rendering on null
  // would flash the card for anyone who has already dismissed it.
  const ready =
    !!event &&
    !!status &&
    dealt === false &&
    shouldDealWrap({
      hoursSinceEnd: status.hoursSinceEnd,
      alreadyDealt: false,
      hasContributed: status.contributorCount > 0 && status.myPhotoCount > 0,
    });

  function dismiss() {
    setDealt(true);
    if (user && event) markFlagSeen(SCOPE, user.id, event.id);
  }

  return { event, ready, dismiss };
}
```

  **Note on `hasContributed`:** there is no per-viewer "did I contribute" field
  on `WrapStatus` — the gate returns a *count*, not your own membership. The
  approximation above is deliberate and imperfect. **If it proves wrong on
  device, add `iContributed BOOLEAN` to `get_wrap_gate` rather than guessing
  harder here.**

- [ ] **Step 2: Typecheck, commit**

```bash
npm run typecheck
git add src/hooks/useWrapDeal.ts
git commit -m "feat(wrap): decide whether to deal the launch card"
```

---

### Task 3: The launch card — turn, then fill

**Files:**
- Create: `src/components/wrap/WrapDealtCard.tsx`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `useWrapDeal`, `DealtCard`, `MelloPin` (from `@/components/ui`).
- Produces: `<WrapDealtCard />` — no props, root-mounted.

Spec §5.0 and §7.1.

- [ ] **Step 1: Build the card.** Face carries **"Wrap it up"** on its lower
      third; the whole face is the hit target. Back carries **`MelloPin`**
      (`import { MelloPin } from '@/components/ui'`) — the brand mark, not a
      placeholder. Tapping flips to the pin face, holds ~150ms, then scales that
      face to fill the viewport and pushes `/events/wrap/flow/{eventId}`.

  **The component is `MelloPin`, not `MelloLogo`.** `MelloLogo.tsx` is the file;
  its exports are `MelloPin`, `MelloWordmark` and `CoralGlow`. Use the pin —
  the wordmark is for auth screens, where the app is introducing itself.

  Do not extend the pin's gradient onto the card body. `MelloLogo.tsx` states
  the rule: *"Gradient is reserved for the logo pin only."* The card is a
  surface; the pin is the mark.

```tsx
// The app's one uninvited full-screen moment, and it fires once per event.
//
// The CTA sits ON the card's face rather than under it: a button underneath
// makes the card an illustration and the button the thing you press — two
// objects, one decorative. On the face, the card IS the affordance, so the turn
// reads as a consequence of your tap rather than a cutscene that follows it.
```

  Mount beside the existing root-level components in `app/_layout.tsx`, which
  are there to clear navigation barriers:

```tsx
      <WrapDealtCard />
```

- [ ] **Step 2: Wire dismissal.** Swiping the card away or backing out calls
      `dismiss()` from `useWrapDeal`, which writes the seen-flag. **It must
      never deal again for that event**, including after an app restart — that
      is the whole point of the flag.

- [ ] **Step 3: Leave the Lottie hook.** Where the pin face reveals:

```tsx
        {/* Lottie L1 goes here, played once on the reveal, over the pin.
            `celebration.json` stands in until it exists — the card works
            without it, it just lands flat. See
            docs/superpowers/specs/2026-08-07-wrap-lottie-manifest.md. */}
```

- [ ] **Step 4: Verify** on device: card deals once after an event; tapping
      anywhere on the face turns it and lands in the flow; **force-quit and
      reopen — it must not deal again**; a user with no recent event sees
      nothing at all.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/components/wrap/WrapDealtCard.tsx app/_layout.tsx
git commit -m "feat(wrap): a card deals itself the day after"
```

---

### Task 4: The chat pin — keep it, upgrade it, stop it ambushing

**Files:**
- Modify: `app/(tabs)/chats/[eventId].tsx` (auto-open :253-257; banner :725-739)

**Interfaces:**
- Produces: none.

- [ ] **Step 1: Delete the auto-open.** Remove the `wrapAutoShown` ref and the
      `useEffect` at :253-257 that force-opens `WrapSheet` on entry.

```tsx
// The wrap no longer ambushes you here. The launch card (WrapDealtCard) is the
// one takeover per event; the chat keeps a permanent pin you open when you want
// it. Two full-screen interruptions for the same event was one too many.
```

  Keep `WrapSheet` itself and the `setWrapSheetOpen(true)` on the banner press —
  only the automatic opening goes.

- [ ] **Step 2: Upgrade the banner.** Replace the emoji (already done in Phase
      2a Task 1) and add the contributor state:

```tsx
          <View style={styles.wrapBannerRow}>
            <AttendeeStack
              people={(status?.contributors ?? []).slice(0, 4)}
              size={22}
            />
            <Text style={styles.wrapBannerCount}>
              {status?.contributorCount ?? 0} of {status?.contributorsNeeded ?? 0}{' '}
              contributed
            </Text>
          </View>
```

  Label: **"Wrap it up"** until you have contributed, then **"View wrap"** —
  the same phrase as every other surface.

  Confirm `AttendeeStack`'s prop names against
  `src/components/ui/AttendeeStack.tsx` and match the file rather than changing
  the component.

- [ ] **Step 3: Verify** on device: entering an ended event's chat no longer
      opens a sheet; the pin is present and stays; tapping it opens `WrapSheet`;
      the count matches the hub.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add "app/(tabs)/chats/[eventId].tsx"
git commit -m "feat(wrap): the chat pins the wrap instead of ambushing you"
```

---

### Task 5: Home — build both, delete one

**Files:**
- Modify: `src/components/wrap/WrapEntryCard.tsx` (variant A)
- Create: `src/components/wrap/WrapRail.tsx` (variant B)
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Produces: `<WrapRail />` — no props.

**This task ships deliberate duplication.** `AGENTS.md` forbids forking, and
this breaks that rule on purpose and temporarily: the choice is about how much
weight the wrap deserves against "Your plans" on a real feed, which cannot be
judged in a browser. **The losing variant is deleted before this branch merges.**
If both are still present at review, the task is not done.

- [ ] **Step 1: Variant A — upgrade the existing card.** In `WrapEntryCard.tsx`:
      add the contributor count beside the progress pill, and flip the copy past
      48 hours:

```tsx
  // Past the deal window the card stops being a summons and becomes a way back
  // in. The card itself stays for seven days (getLatestWrappableEvent).
  const past = (status?.hoursSinceEnd ?? 0) >= 48;
  const title = past ? `View ${event.title} wrap` : `Wrap it up`;
```

  Keep its existing "hide when my checklist is done" behaviour.

- [ ] **Step 2: Variant B — the rail.** Create `WrapRail.tsx`: a horizontal
      `FlatList` of wrap cards reusing `WrapCard`
      (`src/components/wrap/WrapCard.tsx`), fed by `useWrapEntry` plus recent
      wrapped events. Same CTA phrase.

- [ ] **Step 3: Trial them.** In `app/(tabs)/index.tsx`, render one at a time —
      a module-level constant, not a setting, because this is a decision to make
      and remove, not a feature to ship:

```tsx
// TEMPORARY. Flip to compare on device, then delete the loser and this constant.
// See docs/superpowers/specs/2026-08-07-wrap-social-gate-design.md §7.3.
const HOME_WRAP_VARIANT: 'card' | 'rail' = 'card';
```

- [ ] **Step 4: Compare on a device with a realistic feed** — several plans,
      several events. The question is whether the wrap earns the top of the
      feed, which an empty account cannot answer.

- [ ] **Step 5: Delete the loser**, the constant, and the unused component.

- [ ] **Step 6: Typecheck, test, lint, commit**

```bash
npm run typecheck && npm test && npm run lint
git add src/components/wrap/ "app/(tabs)/index.tsx"
git commit -m "feat(wrap): the home treatment, chosen on a device"
```

---

### Task 6: The device test sheet

**Files:**
- Create: `docs/testing/wrap-surfaces-phase-3.md`

- [ ] **Step 1: Write the sheet**

```markdown
# Wrap surfaces (Phase 3) — device sheet

Phases 1, 2a and 2b must be in. ⚠️ rows check reasoning, not an observed bug.

## 1. Dealing exactly once (highest risk — it is uninvited)
| | iOS | Android |
|---|---|---|
| ⚠️ Deals on first open after an event ends | | |
| ⚠️ Dismiss, force-quit, reopen → **does not deal again** | | |
| ⚠️ Never deals for an event older than 48h | | |
| ⚠️ Never deals before the event has ended | | |
| ⚠️ Never deals to someone who already contributed | | |
| ⚠️ No flash of the card for a user who dismissed it (flag read before render) | | |
| Signing out and in as another user on the same phone starts over | | |

## 2. The turn
| | iOS | Android |
|---|---|---|
| Tapping anywhere on the face turns the card, not just the label | | |
| Turn → hold → fill reads as one motion, not three | | |
| Lands in the flow at the photos step | | |
| ⚠️ Backing out of the flow does not re-deal the card | | |

## 3. Chat
| | iOS | Android |
|---|---|---|
| ⚠️ Entering an ended event's chat opens **no** sheet | | |
| Pin is present, permanent, and opens WrapSheet on tap | | |
| Contributor faces and count match the hub | | |
| Copy is "Wrap it up", then "View wrap" once contributed | | |

## 4. Home
| | iOS | Android |
|---|---|---|
| Chosen variant renders with a realistic feed | | |
| Copy flips at 48h | | |
| Card hides once your checklist is done | | |
| ⚠️ **Only one variant remains in the tree** | | |

## 5. Android-specific
| | Android |
|---|---|
| ⚠️ Root-mounted card renders above the tab bar | |
| ⚠️ Card's glass legible on the flat-fill path | |
| ⚠️ Hardware back dismisses the card and writes the flag | |
```

- [ ] **Step 2: Commit**

```bash
git add docs/testing/wrap-surfaces-phase-3.md
git commit -m "docs(wrap): device sheet for the wrap surfaces"
```

---

## Verification

- `npm run typecheck` → 0
- `npm test` → green (6 new in `wrapDeal.test.ts`; all earlier phases still pass)
- `npm run lint` → 0 errors, no new warnings
- **Only one Home variant remains** — `HOME_WRAP_VARIANT` and the loser deleted
- The device sheet is filled in, or its gaps stated plainly

## What can break silently

1. **Rendering the card before the seen-flag has been read.** `dealt === null`
   must not render — otherwise every dismissed card flashes on launch.
2. **A new SecureStore key format instead of `seenFlags`.** Loses the sanitising
   and the fail-open try/catch, and drifts from the existing one.
3. **Both Home variants left in the tree.** Permanent forked duplication, which
   is exactly what `AGENTS.md` exists to prevent.
4. **`WrapSheet` deleted along with the auto-open.** The pin still opens it; only
   the automatic call goes.
5. **The CTA phrase drifting per surface.** Three verbs for one action reads as
   three different features.

## After this phase

The spec's §7.3 open question is closed by Task 5. **No design questions
remain** — the logo question closed on 2026-08-07 with `MelloPin` as the mark,
so Lottie L1 can be commissioned whenever you want it. Everything ships without
it; the card just lands flat until it exists.
