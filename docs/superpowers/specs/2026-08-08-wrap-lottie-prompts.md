# Wrap — Lottie generation prompts

**Date:** 2026-08-08 · **Companion to:** `2026-08-07-wrap-lottie-manifest.md`

Copy-pasteable briefs, one per asset, for generating these in Claude (or handing
to a motion designer). The manifest says *what each asset is for*; this says
*what to ask for*, with the real numbers from the codebase already filled in.

**Paste the "Shared constraints" block at the top of every conversation**, then
one asset prompt. Do them one at a time — asking for seven in one go produces
seven variations of the same thing.

---

## Shared constraints — paste this first

```
You are producing a Lottie animation as a single self-contained .json file
(bodymovin format, Lottie schema 5.x). It will be rendered by
lottie-react-native 7.3.4 on iOS and Android inside a React Native app.

Hard requirements:
- Transparent background. No baked-in backdrop, no solid layer behind the art.
- Vector shape layers only. NO embedded raster images, NO image assets — the
  "assets" array must be empty.
- Avoid: masks, track mattes, merge paths, gradient strokes, expressions, and
  time remapping. Android's Lottie diverges from iOS on all of these and a
  failure is silent — nothing errors, the frame is just blank.
  Gradient FILLS are fine. Gradient STROKES are not.
- Target file size under 60KB.
- 60fps, and state the exact frame count and duration in your reply.
- The FIRST frame and the LAST frame must each read on their own as a still.
  The animation can be skipped, interrupted, or arrive while the app is
  backgrounded, and whatever frame it is parked on has to look deliberate.

Brand palette — use these exact hex values and no others:
- Coral (primary):    #F95B5B
- Violet (secondary): #6D4AD6
- Ink (near-black):   #1A1D24
- White:              #FFFFFF
- Green (success):    #17915A

Tone: playful and energetic, but not childish. This is a social app's
end-of-night moment — think "warm and celebratory", not "confetti cannon".

Reply with the complete .json, then a one-line note on total duration and
frame count.
```

---

## L1 · Card reveal — **P0**

Where it plays: `src/components/wrap/WrapDealtCard.tsx`, on the card's back
face, the instant it finishes turning and before it scales up to fill the
screen. `HOLD_MS` is 150ms and `FILL_MS` is 260ms, so this has roughly the first
400ms to itself.

```
Create a Lottie animation, max 1.0 seconds, that does NOT loop.

Canvas: 400x400, transparent.

At the centre sits a static brand mark I will render myself underneath your
animation — a teardrop map-pin shape, 364x520 units, tall and rounded at the
top, tapering to a point at the bottom, filled with a diagonal gradient from
#F95B5B (top-left) to #6D4AD6 (bottom-right). DO NOT draw the pin. DO NOT
recolour or cover it. Treat the centre 40% of the canvas as occupied.

Animate AROUND that occupied centre: small celebratory elements that enter from
outside the frame, react to the pin, and settle. Think a handful of light
strokes, arcs and dots — like the mark just landed and the air around it moved.
6 to 10 elements maximum.

Motion: elements arrive fast (150-250ms each), staggered, then decelerate and
either settle at low opacity or drift off frame. Nothing should still be moving
at the final frame.

Colours: #F95B5B and #6D4AD6 only, plus #FFFFFF for the smallest accents.

The final frame should be nearly empty — the pin has to be the only thing left.
```

---

## L2 · Rewind hold — **P0**

Where it plays: `src/components/wrap/HoldToConfirm.tsx`. **This one is
scrubbed, not played.** The app drives a `progress` value 0→1 from the hold
timer and seeks the animation to it; releasing early runs it backwards.

```
Create a Lottie animation, exactly 1.2 seconds, that does NOT loop.

Canvas: 300x300, transparent.

CRITICAL: this animation will be SCRUBBED, not played. The app seeks it to an
arbitrary progress value between 0 and 1 and can run it backwards at any point.
That means:
- Use LINEAR interpolation on every keyframe. No ease-in, no ease-out, no
  bezier easing anywhere. The easing is applied by the app's gesture, and any
  easing you bake in fights it.
- The animation must read correctly at EVERY intermediate frame, not just at
  the start and end. Nothing may pop into existence or jump.
- It must look correct played in reverse.

Content: a circular progress fill. A ring near the canvas edge that fills
clockwise from 12 o'clock as progress goes 0 to 1, plus the interior filling
with #F95B5B — starting fully transparent at frame 0 and reaching roughly 85%
opacity at the final frame. Add a subtle radial energy: 3-4 short strokes that
grow outward from the centre as the fill advances.

Leave the centre 90x90 units clear — an icon sits there, drawn by the app.

Colours: #F95B5B for the fill and ring. #FFFFFF at low opacity for the strokes.

Frame 0 must be completely empty (fully transparent).
```

---

## L3 · Rewind success — **P1**

```
Create a Lottie animation, max 1.2 seconds, that does NOT loop.

Canvas: 400x400, transparent.

This plays over a FULL CORAL (#F95B5B) background, so every element must be
white or near-white knockout. Do not use coral — it would be invisible.

Content: a confirmation burst. A checkmark or a circular sweep that completes,
with a short ring of white strokes expanding outward and fading.

Keep the LOWER THIRD of the canvas completely clear — two lines of copy sit
there and must not be crossed by any element at any frame.

Motion: fast arrival (200ms), then a calm settle. Ends with the check or sweep
held steady at full opacity and everything else faded out.

Colours: #FFFFFF only, at varying opacity.
```

---

## L4 · Flow complete — **P1**

Where it plays: `src/components/wrap/flow/steps/StepDone.tsx`, the moment the
`wrap_contributions` row is written.

**Check `assets/lottie/celebration.json` before commissioning this** — the repo
already has a celebration asset used by two other screens, and a second one
would be waste. Only brief this if that asset reads wrong here.

```
Create a Lottie animation, max 1.5 seconds, that does NOT loop.

Canvas: 400x400, transparent.

The feeling is "you did your part" — personal, warm, satisfied. NOT a big group
celebration; that is a different asset (L5) and the two must not feel alike.

Content: a green (#17915A) circle that draws itself and a checkmark that strokes
on inside it, with a small, restrained scatter of coral (#F95B5B) and violet
(#6D4AD6) marks arriving after the check and settling.

Motion: circle draws over 300ms, check strokes on over 200ms, scatter arrives
staggered over the following 400ms and comes to rest. Nothing moving at the end.

Keep the outer 15% of the canvas clear — text sits below and beside it.

Colours: #17915A, #F95B5B, #6D4AD6, #FFFFFF.
```

---

## L5 · Wrap unlock — **P1**

Fires on a live query update, when `contributorCount` crosses the threshold and
the recap opens. It can arrive while the user is looking at a locked screen, so
it must not demand a response.

```
Create a Lottie animation, max 1.5 seconds, that does NOT loop.

Canvas: 400x400, transparent.

The feeling is "the group showed up" — collective, opening, a door giving way.
This must feel DIFFERENT from a personal congratulation: this is about other
people arriving, not about you finishing.

Content: a closed padlock shackle that lifts and opens, and as it does, several
small circular forms (read as people) converge toward the centre from the edges
and form a loose ring. The lock fades as the ring completes.

Motion: lock opens over 400ms, forms converge over 600ms, ring settles and holds
for the remainder. It should end in a calm resting state that does not blink,
pulse or ask to be tapped — it may be on screen for a while after it finishes.

Colours: #1A1D24 for the lock, #F95B5B and #6D4AD6 for the converging forms.
```

---

## L6 · Empty photo slot — **P2**

**Possibly obsolete.** The photo step no longer draws empty frames — the strip
holds only real photos and adding is a button. Only build this if empty slots
come back.

```
Create a Lottie animation, exactly 2 seconds, that LOOPS SEAMLESSLY.

Canvas: 300x375 (a 4:5 portrait frame), transparent.

This sits behind an empty photo slot the user is deciding about, so it must be
NEARLY STILL. Up to five of these may be visible at once and a busy loop across
all of them is noise, not invitation.

Content: a very slow drift — two or three soft rounded shapes moving a few units
and gently changing opacity between 0.15 and 0.3. No spinning, no bouncing, no
pulsing, nothing that draws the eye.

The last frame must match the first exactly so the loop has no seam.

Colours: #F95B5B and #6D4AD6, both at low opacity throughout.
```

---

## L7 · Locked recap — **P2**

```
Create a Lottie animation, 2 to 3 seconds, that LOOPS SEAMLESSLY.

Canvas: 300x300, transparent.

This marks a "waiting on other people" state. It must read as ANTICIPATION, not
as denial or refusal. If it reads as a wall or a barrier it is worse than
nothing and we will not use it.

Content: a padlock, closed, with a slow breathing motion — a gentle scale
between 1.0 and 1.04 and a soft glow behind it that swells and recedes. Two or
three small dots orbit slowly and unevenly, suggesting people still arriving.

Motion must be slow and unhurried throughout. Nothing sharp, nothing that
snaps.

The last frame must match the first exactly so the loop has no seam.

Colours: #1A1D24 for the lock, #F95B5B at low opacity for the glow and dots.
```

---

## After you get a file back

1. Drop it in `assets/lottie/`.
2. Check the `assets` array in the JSON is empty (`"assets":[]`) — if it has
   entries, it embedded a raster image and must be regenerated.
3. Search the JSON for `"tt"` (track matte) and `"mm"` (merge paths). Either
   means it will likely render blank on Android.
4. Wire it at the hook comment already in the code:
   - L1 → `src/components/wrap/WrapDealtCard.tsx`, the `back` face
   - L2 → `src/components/wrap/HoldToConfirm.tsx`, the flood layer
   - L4 → `src/components/wrap/flow/steps/StepDone.tsx`
5. **Test on a physical Android device.** There are no screen tests here, so an
   asset that fails to render will not fail a build — it will just be an empty
   space nobody notices until someone opens the screen.
