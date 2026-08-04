/**
 * The app's overlay choreography: what happens when a full-screen surface takes
 * over from the screen underneath, and what happens when it hands back.
 *
 * These live together, in one file, because this is motion **across** files —
 * the overlay brings itself in, the screen beneath steps back, the tab bar
 * slides away, and none of the three can be timed without the other two. Split
 * between them they were four magic numbers that had to agree, and the first
 * version's did not: home faded over 420ms while the chip it had handed over
 * flew for 460, so its own copy ghosted behind the travelling one for most of
 * the journey.
 *
 * Today the notifications screen is the one overlay that runs the full set;
 * `sceneOut`/`sceneReturn` are the general part and already drive the tab bar
 * everywhere it steps aside — an open chat thread, the in-map create flow.
 *
 * ── Coming in ───────────────────────────────────────────────────────────────
 *   0ms     the handed-over element is hidden on the screen below; the
 *           overlay's flying copy takes over its exact pixels
 *   0–300   the scene beneath steps back — content dissolves, tab bar slides
 *           down and out
 *   0–460   the element flies to its new home, changing what it is on the way
 *   190–570 the overlay's own content rises in behind it
 *
 * ── Going out ───────────────────────────────────────────────────────────────
 *   0–170   the overlay's content drops away first, and fast
 *   40–420  the element flies back to where it started
 *   110–400 the scene returns — *after* the content has cleared, never through
 *           it
 *   420     the route pops, and the screen below takes its element back
 *
 * ── Three rules these encode ────────────────────────────────────────────────
 *
 * **One copy of a handed-over object, ever.** The screen below hides its copy
 * outright rather than fading it, for the whole time the overlay exists. A fade
 * means two of the thing on screen at once, which is the one thing a hand-off
 * must never look like.
 *
 * **The two directions are not mirror images.** Going out the scene clears fast,
 * so the overlay arrives on an empty stage. Coming back it *waits* — the overlay
 * has to be gone before the scene reappears under it, or they cross-fade through
 * each other and it reads as lag.
 *
 * **The scene is fully back before the route pops.** Return finishes at 400ms
 * and the pop is at 420, so the hand-off at the end lands on a settled screen
 * rather than a half-faded one.
 */
/**
 * The travelling selection — DESIGN.md §8.
 *
 * A single indicator that moves to whatever is now selected, rather than each
 * option lighting up on its own. The create flow's category grid and section
 * row use it, and so does the profile editor's gender picker.
 *
 * These sit here rather than beside the create flow because the whole point is
 * that the motion is *the same wherever it appears* — two copies of the numbers
 * would drift the first time either was tuned, and the drift would be invisible
 * until someone saw both on one screen. `map/create/motion.ts` re-exports them
 * so the create flow's own imports didn't have to churn.
 */

// Damping 24, not the tab bar's 19: a spring's overshoot is a fixed proportion
// of the distance travelled, so numbers that read as a pleasant settle over
// 60pt read as a lurch over 300. This puts the ratio just under critical — it
// still arrives rather than stops, but the overrun stays small however far it
// came.
export const GLIDE = { stiffness: 190, damping: 24, mass: 0.85 } as const;

// How much a travelling indicator compresses on its way — the "wobble". It is
// what makes the indicator read as one object being thrown across the row
// rather than a rectangle being redrawn in a new place.
export const SQUASH = 0.08;

export const OVERLAY_TRANSITION = {
  // The element handed between the two screens.
  travelInMs: 460,
  travelOutDelayMs: 40,
  travelOutMs: 380,

  // The overlay's own contents.
  contentInDelayMs: 190,
  contentInMs: 380,
  contentOutMs: 170,

  // The scene underneath: the page and the tab bar, which step back together
  // and return together. One set of numbers, because they are one movement.
  sceneOutMs: 300,
  sceneReturnDelayMs: 110,
  sceneReturnMs: 290,
} as const;
