# Event sheet: description reveal, pinned CTA, square hero

Scope: `src/components/events/EventBottomSheet.tsx`. Everything about the
sheet's existing flow — the two-stop drag, the frosted-glass card, who's-going,
the attendee hand-off animation, "Happening near you" — stays exactly as it
is. This spec covers four connected changes, all driven by one problem: a long
`event.description` currently renders in full with no clamp, which (a) can
starve the hero photo of its growth budget and (b) pushes the CTA to wherever
the description happens to end.

## 1. Hero photo: dynamic square, not anchor-derived

**Today:** at the full-screen stop the photo is `BANNER_H + heroGrow`, where
`heroGrow` is solved so the who's-going card's first row lands just above the
home indicator (`goingAnchorPx`, computed from a mid-render layout pass over
everything above it — host row, title, info, pills, description, actions).
Floor-clamped at 0. A long description can consume the whole budget and leave
the hero stuck at 232px regardless of screen size — the "flat 45%" the
original comment promises doesn't hold in that case.

**New:** the hero is a square at the full-screen stop —
`photoRenderH = screenWidth` — clamped to never exceed the sheet's own climb
(`height - first`). This depends only on device width, so it's the same
fraction of *this* screen on every device, and it no longer depends on
description length, title length, or attendee count.

This retires the anchor-based sizing entirely:

- Remove `goingAnchorPx`, `onGoingAnchorLayout`, `goingAnchorBottomRef`,
  `HERO_OVERSHOOT`, and `goingRestBottom`.
- `GOING_CARD_PAD` stays — it's also the face-slide travel distance in
  `GoingRow`/`GoingStack`, unrelated to hero sizing.
- Who's-going's first row is no longer guaranteed visible at the full-screen
  stop without scrolling. That's fine under this design — see §4, it's
  already a scroll-revealed section.

## 2. The CTA: pinned during the description, then released

> **Corrected after first implementation.** An earlier version of this spec
> said the CTA moves to a `BottomSheetFooter` and "never releases." That was
> wrong — it contradicted the brainstorm, where the chosen behavior was
> explicitly "releases into normal flow once the description is fully
> revealed." A permanent footer also let the who's-going card bleed past the
> button's edges (the button was a bottom overlay while that content sat in
> normal flow right behind it). This section describes the corrected model.

**Today:** the primary action (Join / Open chat / Manage / Request pending)
renders inline inside `BottomSheetScrollView`'s content, inside `styles.actions`
— its position is a function of everything above it, and `firstSnapPx` is
computed backwards from where it lands (`actionsY + primaryBottom`).

**New:** the primary action rides **in the scroll flow** (a `StickyPrimary`
wrapper), placed right after the description and before who's-going — not in a
`BottomSheetFooter`. A reanimated transform pins it to a fixed screen line
while the description is still revealing, then lets it go:

```
translateY = min(0, pinTargetY − naturalTop)
```

While the button's natural (in-flow) position is below the pin line it's
pulled up to sit exactly on it; once enough has scrolled that its natural
position rises to the pin, the pull reaches 0 and it travels with the content
like anything else — releasing, so who's-going, pending and nearby scroll up
from below it. The screen-position math (`animatedPosition` + the card's reveal
slide + its own `y` − scroll) is the same one `useEnterOnScroll` uses, so the
button stays in lockstep with the description lines revealing just above it.

**Why in-flow, not a footer — no bar, no overflow.** This placement is what
keeps anything from ever sitting behind or below the button: the reserved but
unrevealed description lines above it are `opacity: 0` until they cross the pin
(§3), and who's-going follows it in flow, off-screen until it releases. Its
wrapper is opaque white matching the sheet (not a distinct/frosted bar) — it
reads as part of the sheet, and its fill is belt-and-braces against the hidden
lines showing.

**Moves into the action as one unit** (unchanged from how it looks today):

- The primary `Button` (Join / Request pending / Open chat / Manage event).
- On the not-joined path, the `spotsInfo` block (spots count + "N spots
  left") beside the button in `styles.footerRow`.

**Stays in normal scroll flow, unchanged:** the secondary buttons (guest
Check-in, host's Open chat under Manage), and everything in §4 — now all after
the sticky action in flow, so they're part of what scrolls up when it releases.

The wishlist toast keeps its `BottomSheetFooter` (a toast still wants to dock
to the screen bottom); it's the only thing left there.

**Resting height is capped, not description-driven.** The first-tap height is
`min(header + clamped-visible-description + action + insets, RESTING_MAX_FRACTION
× screen)`. A long description can never push the resting stop taller — it
clamps to what fits above the action and reveals the rest on scroll. A short
description sits snug (below the cap), no forced gap. The clamp (how many lines
show at rest, §3) and the cap both key off the same `RESTING_MAX_FRACTION`
(0.58, tunable), so the visible lines always fit exactly above the pinned
action. `firstSnapPx` derives from the clamped visible description (or, with no
description, the action's own measured top), never from the action's real
in-flow position — which sits below the full reserved description and would
balloon the stop.

## 3. Description: dynamic clamp + reusable line-reveal

**Measurement.** Reuse the technique already written up (but never shipped) in
this file's own history: a hidden, in-flow measuring `Text` — full
description, no line limit, `opacity: 0`, mounted for its whole natural
height — laid out via `onTextLayout`. That gives the real line count and each
line's substring. It stays mounted and in-flow so the block's full height is
known from the first frame; nothing about it resizes later and re-snaps the
sheet mid-gesture (the exact failure mode the old commit message warned
about).

**Initial visible count is computed, not hardcoded to 3 or 4.** It's however
many lines fit between the description's top and the footer's fixed screen
position. The last visible line gets an ellipsis if the description doesn't
end there. Most events will land near 3 lines, but it is derived per event —
a short title/info block leaves more room, a tall one leaves less.

**New component: `RevealingLines`** (name open to change), built by
generalizing the existing `useRowEntrance` hook (already used for
`GoingRow`/`GoingStack`) rather than writing a parallel implementation:

- Takes the full set of lines and the initial visible count.
- Lines past the initial count render in normal flow immediately after the
  visible chunk — physically laid out below the fold, behind the footer's
  z-order — and each one animates in **Fade + Rise** (opacity 0→1, small
  upward translate), the same motion language as who's-going's rows.
- Trigger is position, not scroll-percentage: a line arrives the moment it
  clears the footer's *top* edge (not merely the screen's bottom edge) — this
  is what makes it read as sliding out from behind the CTA rather than just
  fading in from underneath the screen. Uses the same
  `animatedPosition`/`animatedScrollableState` inputs `useRowEntrance` already
  reads, so it's one hook driving both who's-going rows and description
  lines, not two.
- Plays once; scrolling away and back doesn't replay it (matching the
  existing who's-going rows).

## 4. Banner reorder: everything below the footer, one scroll-revealed block

`pendingSection` (host's join-request list) moves from above `actions` to
below it, joining who's-going and "Happening near you" as one contiguous
section beneath the pinned footer — all three reached by continuing to scroll
once the description has fully revealed. This is a real behavior change for
hosts (pending requests are no longer visible without scrolling), accepted as
part of this design.

## Testing

No component test coverage exists for this file (Reanimated 4 throws under
Jest — see `AGENTS.md`). Line-count measurement math (given a line height and
a gap, how many lines fit) is pure and can be unit tested if extracted as a
plain function; the entrance/reveal animation itself cannot be tested
headless and needs a device — Android in particular, since this file's own
history notes elevation/shadow clipping differences there.
