# Mello — working agreements

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before
writing any code.

---

## Before writing UI, check what already exists

The single biggest source of mess in this codebase has been building a thing
that already existed. Thirty-one screens hand-rolled a header because
`ScreenHeader` was missing one prop. Ninety-seven ad-hoc button styles existed
because `Button` had no small size. Sixteen screens re-implemented the same
modal. **Every one of those was cheaper to fork than to fix — that is the
failure mode to avoid.**

So, in order:

1. **Look in `src/components/ui/` first.** If a primitive is close but missing
   something, **add the prop**. Do not fork it. A missing prop is a five-minute
   fix; a fork is permanent.
2. **If it doesn't exist and you'd need it twice, build it in `ui/`.** If you
   need it once, keep it local — a premature primitive is as bad as a fork.
3. **Only then write something bespoke**, and say in a comment why the
   primitive didn't fit.

### What exists

| Need | Use |
| --- | --- |
| Screen shell, safe area, status bar | `Screen` (pass `modal` on `presentation: 'modal'` routes) |
| Header with back button | `ScreenHeader` — has `subtitle`, `right`, `backIcon`, `tone` |
| Back / close / dismiss | `NavButton` — bare glyph, no chip |
| An action *on* a screen (share, filter, refresh) | `IconButton` — has the chip |
| Any button with a label | `Button` — see the three-variant rule below |
| Text input | `TextField` — label, error, hint, counter, leading/trailing slots |
| Nothing-here state | `EmptyState` |
| Bottom sheet / centred confirm | `Sheet` / `Dialog` |
| Tap feedback | `PressableScale` |
| Person | `Avatar`, `AttendeeStack` |
| Category | `CategoryTile`, `CategoryPill`, `ActivityGlyph` |
| Small uppercase heading | `SectionLabel` |

---

## Hardcoding

**Read `DESIGN.md` before any visual change.** It holds the target look — the
frosted-glass surface tiers, the animated background, the colour and radius
values — taken from the home-screen mockup, and marks which parts are already
built. Do not re-derive the design from a screenshot when the numbers are
written down.

**Never hardcode a colour.** Use `COLORS` from `@/constants/colors`. It has the
ink ramp (`inkFaint`, `placeholder`, `inkLabel`, `scrim`) that the raw
`rgba(15,24,44,*)` literals were approximating. `COLORS.accent` is the app black
— header black and secondary-button black are the same value on purpose.

**Never hardcode a font family.** Use `FONTS`. This one is already at 100%
adoption — keep it there.

**Font sizes: use `TYPE` / `TYPE_SIZE` in `src/components/ui/`.** Screens still
carry ~500 one-off sizes; that is known, deliberate debt (see `CLEANUP.md`). Do
not mass-migrate them, but do not add to them either — if you are writing new
UI, use a step.

**Query keys go in `src/constants/queryKeys.ts`** if more than one file touches
them. Each family exposes `all` (what you invalidate) and `of()` (what you read
with). A hand-typed key that drifts fails **silently** — no type error, no lint
warning, just a screen that stops refreshing.

**Adding a feed that shows other people's events?** Add its key to
`DISCOVERY_FEED_KEYS`, or blocking someone will leave them on your new screen.
That has already happened twice.

Genuinely fine to hardcode: one-off layout numbers, animation timings, and glyph
metrics (an emoji's `fontSize` is not typography). Comment when it's non-obvious.

---

## Buttons — exactly three

Pick by how much weight the action deserves, not by colour.

- `primary` — **coral.** Major CTAs only: sign in, host, pay, check in, save.
  Aim for one per screen. Reaching for this should feel like a decision.
- `secondary` — **black.** The workhorse. This is the default.
- `tertiary` — **white.** Low-stakes: back, dismiss, done, edit.

All three are rounded rectangles. **There are no pill buttons.** If you find
yourself styling a `PressableScale` to look like a button, use `Button` — it has
`sm`/`md`/`lg` and an icon slot.

---

## Weigh the options before writing

Prefer the boring, obvious solution. Before a non-trivial change:

- **Measure before you claim.** "This is duplicated everywhere" is a hypothesis
  until you have grepped it. Two audits in this repo were wrong — one flagged
  live code as dead, another over-counted style drift by 3×. Numbers in commit
  messages should be measured, not estimated.
- **Ask what breaks silently.** Query keys, cache invalidation and optimistic
  updates all fail without an error. `tsc` and `eslint` cannot see them.
- **Don't mix a refactor with a redesign.** If one commit changes both structure
  and appearance, nobody can tell which caused the regression and it can't be
  bisected.
- **A comment explaining *why* is worth ten explaining *what*.** Comment the
  constraint, the bug that shaped the code, or the reason the obvious approach
  doesn't work. Not the syntax.
- **If you can't verify it, say so.** "Untested on Android" in the summary is
  worth more than confident silence.

---

## Verify

```sh
npm run typecheck   # must stay at 0
npm test            # must stay green
npm run lint        # 95 errors / 16 warnings are pre-existing; don't add
```

There is no snapshot or screen-test coverage, so **`tsc` passing does not mean
the UI is right.** Anything visual needs a device — Android specifically,
because `react-native`'s `SafeAreaView` is a no-op there and that whole class of
bug is invisible on iOS.

Tests live in `src/**/__tests__/` and cover `utils/`, `services/` and hooks.
Component tests are not set up: Reanimated 4 throws on import under Jest. Test
logic by extracting it — see `participationMutations` in
`useEventParticipation.ts`, where the mutation options are a plain factory
precisely so they can be driven without a renderer.

See `CLEANUP.md` for outstanding work and the current state of the audit, and
`DESIGN.md` for the visual direction and what of it is still unbuilt.
