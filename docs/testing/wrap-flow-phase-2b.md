# Wrap flow interactions (Phase 2b) — device sheet

Phases 1 and 2a must be in. ⚠️ rows check reasoning, not an observed bug.

Nothing here has been run. Every row is reasoning from the source — there is no
screen-test coverage in this project, so `tsc` passing says nothing about
whether any of it renders.

## 1. Thumbs-down reasons (highest risk — this one writes to moderation)
| | iOS | Android |
|---|---|---|
| ⚠️ Swiping left saves the rating **before** any chip is touched | | |
| ⚠️ Skipping the chips still advances and still completes the flow | | |
| ⚠️ "Made me uncomfortable" writes a `reports` row with a `wrap_rating:` prefix | | |
| ⚠️ "No-show" writes one too | | |
| ⚠️ "Not my vibe" writes **no** report | | |
| ⚠️ The chips are about the person you just swiped, not the one now on top | | |
| ⚠️ Chips replace the action row and give it back after a pick — the deck is not stuck | | |
| No screen claims thumbs-down is private any more | | |
| ⚠️ A failed report surfaces an error instead of failing silently | | |

## 2. The hold
| | iOS | Android |
|---|---|---|
| Ring fills in about 1.2s | | |
| ⚠️ Releasing at 80% drains rather than snapping to zero | | |
| ⚠️ Dragging the finger off the glyph cancels cleanly | | |
| Haptic on start and on completion (physical device only) | | |
| Count before the hold matches the hub's tally | | |
| ⚠️ Guest and host see different success copy | | |
| ⚠️ A guest at an event with 1 encore reads "You want to run it back", not "You and 0 others" | | |
| ⚠️ Already-requested state shows the done glyph, not a re-holdable ring | | |

## 3. Carousel
| | iOS | Android |
|---|---|---|
| Five frames; next one visibly peeking | | |
| ⚠️ Every frame is 4:5 regardless of the source photo's shape | | |
| Drag snaps to the nearest frame; a flick advances one | | |
| ⚠️ Tapping a neighbour centres it **and the track actually moves** | | |
| ⚠️ A very wide and a very tall photo both fill without distorting | | |
| ⚠️ Tapping an already-uploaded frame does nothing (deleting is the gallery's job) | | |
| ⚠️ Tapping a picked-but-not-uploaded frame removes it | | |
| ⚠️ The carousel bleeds to both screen edges, not just one | | |

## 4. Note on the card
| | iOS | Android |
|---|---|---|
| ⚠️ Legible on a very dark photo **and** a very bright one | | |
| ⚠️ Tapping it does not open the profile behind it | | |
| ⚠️ It does not collide with the Add friend button | | |
| Composer opens over the deck and returns to the same card | | |

## 5. Skip
| | iOS | Android |
|---|---|---|
| Absent at 6 people, present above 15 | | |
| ⚠️ Skipping still marks you a contributor | | |

## 6. Android-specific
| | Android |
|---|---|
| ⚠️ `onPhoto` glass legible with no backdrop blur (flat fill path) | |
| ⚠️ Carousel pan does not fight the flow's own gestures | |
| ⚠️ Hold gesture survives a scroll starting on the glyph | |
| ⚠️ The hold's SVG ring renders (Circle only — no unsupported primitives) | |
