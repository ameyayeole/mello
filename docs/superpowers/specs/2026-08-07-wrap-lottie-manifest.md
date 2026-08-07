# Wrap — Lottie manifest

**Date:** 2026-08-07 · **Status:** open list, nothing commissioned yet
**Companion to:** `2026-08-07-wrap-social-gate-design.md`

Running list of every Lottie the wrap needs. Keep it updated as the flow moves —
this is the brief you hand a motion designer, and the checklist for what still
blocks a phase.

## What already exists

| File | Used by |
|---|---|
| `assets/lottie/celebration.json` | `app/events/host/[eventId].tsx:776`, `app/events/created/[eventId].tsx:105` |

That is the **only** Lottie in the repo. `lottie-react-native@7.3.4` is
installed and working, so the integration path is proven — the gap is assets,
not plumbing.

---

## Needed

Priority: **P0** blocks the phase · **P1** ships better with it · **P2** polish.

### L1 · Card reveal character — **P0**

- **Where:** §5.0 the turn; §7.1 the launch dealt card
- **Moment:** plays as the card lands on its logo face, before the scale-to-fill
- **Length:** ≤ 1.0s, **must not loop**
- **Notes:** this is the hero. It plays over **`MelloPin`** — the brand pin,
  which is the mark (decided 2026-08-07; there is no separate logo coming). Give
  the designer the pin's actual geometry from
  `src/components/ui/MelloLogo.tsx`: a 364×520 teardrop pin filled with the
  `COLORS.primary → COLORS.secondary` gradient.
- **Ask for** a character *entering and reacting to* the pin, not a full-frame
  burst — the pin must stay readable throughout, and it must not be recoloured.
  That gradient is the app's only sanctioned one and belongs to the pin alone.
- **Not blocked.** This was previously waiting on a logo that was never coming.

### L2 · Rewind hold — **P0**

- **Where:** §5.4, under the thumb during the press-and-hold
- **Moment:** progresses with the hold, 0 → 1 over ~1.2s; **reverses on early
  release**
- **Length:** 1.2s, driven by progress, not autoplay
- **Notes:** must be **scrubbable** — the app drives `progress` from the hold
  timer rather than calling `play()`. Ask for a linear build with no easing
  baked in; the easing belongs to the gesture.
- **Why it matters:** the prototype fakes this with a CSS opacity flood. That
  flatters it. This is the single place the "playful and energetic" direction
  either lands or doesn't.

### L3 · Rewind success — **P1**

- **Where:** §5.4, after the hold completes
- **Length:** ≤ 1.2s, no loop
- **Notes:** plays over a full-coral screen, so it must read in **white/knockout**.
  Two copy variants sit under it (guest vs host) — leave the lower third clear.

### L4 · Flow complete — **P1**

- **Where:** §5 Done, the moment `wrap_contributions` is written
- **Length:** ≤ 1.5s, no loop
- **Notes:** the emotional payoff for finishing. Currently mocked with a confetti
  icon. `celebration.json` may be reusable here — **check it before
  commissioning**; a second confetti asset would be waste.

### L5 · Wrap unlock — **P1**

- **Where:** §4.3, when `contributorCount` crosses N and the recap opens
- **Length:** ≤ 1.5s
- **Notes:** fires on a **live query update**, so it can arrive while the user is
  looking at a locked screen. Needs a resting state that does not demand a tap.
- **Distinct from L4:** L4 is "you did your bit"; L5 is "the group did". Do not
  let one asset serve both — the whole design rests on those being different
  feelings.

### L6 · Empty photo slot — **P2**

- **Where:** §5.1 carousel, the unfilled 4:5 frames
- **Length:** 2s, **loops**
- **Notes:** the only looping asset on this list. A loop is only justified here
  because the slot is a resting state the user is deciding about. Keep it
  near-still — a busy loop behind five slots is noise.

### L7 · Locked recap — **P2**

- **Where:** §4.3, the "waiting on N more people" state
- **Length:** 2–3s, loops slowly
- **Notes:** must read as *anticipation*, not *denial*. If it reads as a wall,
  drop it and keep the static lock glyph — a discouraging loop is worse than
  none.

---

## Constraints for whoever builds these

- **Transparent background**, no baked-in backdrop.
- Target ≤ 60KB each. `celebration.json` is the size reference.
- No embedded raster images — they defeat the format and bloat the bundle.
- **Test on Android.** Lottie feature support diverges from iOS, and this repo
  has no screen tests, so an asset that silently fails to render will not fail
  a build. Effects that commonly break: masks, mattes, merge paths, gradient
  strokes. Ask for these to be avoided rather than discovered later.
- Every asset must have a **still frame that reads on its own** — the animation
  may be skipped, interrupted mid-play, or arrive while the app is backgrounded.

## Open

- **Nothing is blocked.** The logo question is closed — `MelloPin` is the mark.
- Nobody has been briefed yet. L1 and L2 are the only P0s — the flow can ship
  behind static glyphs for everything else, and probably should on the first
  device pass so the motion can be judged against something.
