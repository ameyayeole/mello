# The event deck as one component

**Date:** 2026-08-04
**Status:** design agreed, not built

The map's "Up for it?" fan and the swipe deck it opens become a single
component with two sizes, rather than two renderings that hand off to each
other.

---

## 1 · Why

The fan and the dealt deck are currently two separate things that try to look
like one. Tapping the fan measures it, hides it, and deals a *different* set of
cards from those coordinates. Six rounds of tuning went into making that look
continuous — the arc, the spin, the stagger, per-mini origins — and it still
reads as a hand-off, because it is one.

A hand-off between two elements can be made *close*. It cannot be made
seamless, because on the first frame there genuinely are two different things.

If instead each card is one element that never unmounts and simply moves
between a small slot and a large one, the transition is a single interpolation
and there is nothing to get wrong.

## 2 · The component

`EventDeck` replaces `SwipeDeckTeaser` and the `source === 'swipeDeck'` branch
of `EventDealtCard`.

One shared value, `expand` (0 = parked in the corner, 1 = open on screen),
drives everything:

| At 0 | At 1 |
| --- | --- |
| Cards in the fan's slots — mini rect, mini tilt | Cards in `stackLayer(depth)` slots |
| Photo only | Photo + glass pane, title, host, CTA |
| "Up for it?" label and count badge visible | Counter and pass/save/undo row visible |
| No dim | Dim at 90% |

Card *N* interpolates between exactly two slots: its fan slot and
`stackLayer(N)`. The stack table is the one the map pin's card already uses —
this does not introduce a second definition of the messy stack.

### Slots

The fan's slots are the tilts and offsets `SwipeDeckTeaser` already carries
(`5°/-7°/-19°` at small offsets, 82×110). They move onto the new component as
its minimized layout, so nothing has to be measured at tap time any more —
which also deletes the `measureInWindow`-counting dance the current version
needs before it can start.

## 3 · Where it lives, and the constraint that governs it

Root portal, above everything — same layer the dealt card uses.

**`CardPortal`'s existing comment is a constraint, not a note:** on iOS the
overlay attaches to the key window when it mounts, so it must be mounted only
while it is meant to be on top. A permanently-mounted overlay floats above
modal routes.

Keeping the fan in the portal means it *is* mounted for as long as you are on
the map. So visibility is an explicit rule, not an accident:

> Minimized renders only when the route is the map tab **and** `creatingEvent`
> is false **and** `overlayOpen` is false.

Both flags already exist in `uiStore` and are already used to hide the tab bar
for the same reason. Getting this wrong puts the fan over the create-event
flow, and nothing in `tsc` or the tests can see it.

Expanded renders regardless of route — it is the top thing on screen by
definition.

## 4 · The morph

Small is photo-only, exactly as the fan is today. As the card grows, the glass
pane and its contents fade in across the **last third** of the movement.

The photo element never swaps. One photo gets bigger and gains its furniture,
which is what makes it read as the same object rather than a replacement.

`EventCard` gains an `emerge` prop (0–1) driving the pane's opacity. Default 1,
so every existing caller — the pin's dealt card, and whatever renders it in a
feed later — is unaffected.

## 5 · The infinite deck

The deck reads `useSwipeDeck()` live rather than snapshotting ids.

`useSwipeDeck` is already a `useInfiniteQuery` with `PAGE_SIZE 20`,
`fetchNextPage` and `hasNextPage` — the paging exists. What is missing is only
that `dealCard(ids, …)` freezes the id list at the moment of the tap, so pages
loaded afterwards never join the open deck.

- The component reads the live list, so new pages arrive underneath you.
- `fetchNextPage()` fires when the current index is within 5 of the end, so the
  deck never visibly runs out mid-swipe.
- Six cards render at a time (`STACK_DEPTH + 2`), unchanged — the current
  version already does this, so this is not where the win is.
- Swiped cards do not return; that is `useSwipeDeck`'s existing behaviour and
  is not touched.

## 6 · Gestures

Unchanged from today, with one addition that falls out of the design:

| Input | Result |
| --- | --- |
| Tap the fan | Expand |
| Tap a card | Flip to its back |
| Swipe left / right | Pass / save, quota-aware, next card promotes |
| **Drag down** | **Minimize** — the deck goes home to the fan rather than closing |
| Tap the dim | Minimize |

Drag-down returning the deck to the corner rather than dismissing it is the
right behaviour for an object that has a home to go back to.

## 7 · What this does NOT merge

This makes the **deck** one component. It does not merge the deck with the map
pin's card.

Those stay separate on purpose: a pin's card is transient and dealt from an
arbitrary measured origin, while the deck is a persistent object with two
fixed sizes. Forcing one component to be both would mean a card that sometimes
has a home and sometimes does not.

They share what should be shared: `EventCard`, `stackLayer`, the swipe
threshold, and the haptic vocabulary. Recorded here so that the next person to
open this does not read two card systems as an accident.

## 8 · What is deleted

- `src/components/map/SwipeDeckTeaser.tsx`
- `EventDealtCard`'s `isSwipeDeck` branch, its `DeckChrome` wiring, and the
  `source` discriminant's `'swipeDeck'` case if nothing else uses it
- `uiStore.dealtCard.origins` and `swipeDeckOrigin` — both exist only to carry
  fan coordinates to a component that will no longer need them
- The `measureInWindow` counting in the teaser's `onPress`

`DeckChrome` and `DeckEmptyCard` survive; they move to the new component.

## 9 · Verification

`tsc` and the test suite can see none of this — Reanimated 4 throws on import
under Jest, so nothing visual here is unit-testable. What can be tested:

- the slot table (fan slot and stack slot per depth) as a pure function, the
  way `dealtCardGeometry` already is
- the visibility rule (`map route && !creating && !overlay`) as a pure
  predicate

Everything else needs a device. Rows worth writing:

1. The fan does **not** appear over the create-event flow, the map filters, or
   any pushed route (the portal constraint, §3)
2. Expanding and minimizing reads as one object moving, not two swapping
3. The pane fades in over the last third rather than popping
4. Swiping past the page boundary does not stall or empty the deck
5. Android: the fan sits correctly above the tab bar, and the portal's
   Android path (a plain sibling, no `FullWindowOverlay`) still paints above
   the map
