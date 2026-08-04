# The event deck as one component — device test sheet

Covers all four tasks of `2026-08-04-event-deck-one-component`: `EventDeck`
(new), its mount in `app/_layout.tsx`, the removal of `SwipeDeckTeaser` and
`EventDealtCard`'s `isSwipeDeck` branch, and the `emerge`/`FlipHint`
carry-forwards from task 3's review. **None of this has been run on a device.**
Nothing here is reachable under Jest — Reanimated 4 throws on import — and
`tsc`/`eslint` cannot see a mis-set `pointerEvents` gate, a portal mounted over
the wrong route, or an animation that reads as two things instead of one.

Run on **iOS and Android**. Android is not optional: `CardPortal`'s Android
path is a plain sibling of `<Stack>`, not `FullWindowOverlay` (that's iOS-only)
— section A exists to check that path still paints above the map and the tab
bar on its own.

Tick each row on each platform. A row that cannot be run is **BLOCKED**, not
passed — note it and come back. Rows marked **(reasoning)** are checking a
conclusion from reading the code, not something already observed on a
simulator; they're the ones most worth someone's time.

**What changed, so you know where to look:**

| Area | Change |
| --- | --- |
| `EventDeck.tsx` | New. The map's "Up for it?" fan and the swipe deck it opens, as one component with two sizes (`expand`, 0→1), root-mounted in `app/_layout.tsx`. |
| `SwipeDeckTeaser.tsx` | Deleted. Was the fan; `EventDeck`'s minimized state replaces it. |
| `EventDealtCard.tsx` | Stripped to one card, no stack. `isSwipeDeck`, the quota, `DeckChrome`, `DeckEmptyCard`, `originTilts`, the exhausted state, and the background-face stack machinery (`BackgroundFace`, `useCachedEventSummary`) are all gone — a pin's card deals one event and closes on a swipe. |
| `uiStore.ts` | `swipeDeckOrigin`/`setSwipeDeckOrigin`, `dealtCard.origins`, and the `DealtCardSource`/`source` discriminant are gone — nothing produced `'swipeDeck'` once the teaser was deleted. |
| `EventCard.tsx` | `emerge` now fades the category pill and the save/share chips along with the pane, not just the pane (task 3 review item a). |
| `DealtCard.tsx` | `FlipHint` ("Tap for details") exported and reused by `EventDeck` (task 3 review item b). |

**Known, not fixed here:** `DeckActions`' undo button is inert (task 3 review
item c, confirmed by grep — ticketed separately, out of scope for this batch).
It always reads `canUndo: false` because `useSwipeDeck()`'s `history` is local
per call site, and the deck's own swipes go through `useRecordSwipe()` instead.
Free users are unaffected (they hit the paywall either way); a premium user
tapping undo on the deck is the row to reproduce it on, if anyone wants to see
it happen rather than take the grep's word for it.

---

## A · The portal constraint — run this one first

`CardPortal` lifts the deck into a layer that attaches to the key window the
moment it mounts (iOS) or sits as a stack sibling (Android). `EventDeck` is
root-mounted and unconditionally rendered, so **whether the fan shows at all is
entirely `deckVisible`'s job** — nothing conditionally renders `<EventDeck />`
itself. Getting the visibility rule wrong puts the fan (or worse, the open
dim) over screens that should never see it.

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| A1 | Open the map tab | Fan appears bottom-left, tucked under the tab bar | ☐ | ☐ |
| A2 | Switch to another tab | Fan disappears | ☐ | ☐ |
| A3 | Start creating an event (tap Create, drop a pin) | Fan does **not** appear over the create flow at any step | ☐ | ☐ |
| A4 | Open the map filters sheet | Fan does not show through/over it | ☐ | ☐ |
| A5 | Open a dealt card from a pin, the home rail, or search | Fan is not visible behind/over the dealt card | ☐ | ☐ |
| A6 | Push any modal route (wishlist, premium, a friend's profile) from the map tab | Fan does not float above it | ☐ | ☐ |
| A7 | With the deck **expanded**, background the app and reopen | Dim + open deck are still there, nothing behind them leaked through | ☐ | ☐ |
| A8 | While the dim is up (deck expanded), try tapping the map behind it | Nothing responds until you minimize | ☐ | ☐ |
| A9 | While the fan is **parked** (not expanded), tap the map underneath/around it | Map pans and responds normally — the parked dim must not be eating touches | ☐ | ☐ |

**A9 is the one to watch closely.** The dim is a full-screen view at opacity 0
while parked, gated `pointerEvents={expanded ? 'auto' : 'none'}`. If that gate
is backwards the map stops responding entirely and nothing on screen explains
why.

## B · Expand and minimize — the whole point of the merge

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| B1 | Tap the fan | Reads as **one object growing**, not the fan disappearing and a different stack appearing | ☐ | ☐ |
| B2 | Watch the glass pane, title, host row and CTA as it grows | Arrive over the **last third** of the growth, not all at once and not from frame one | ☐ | ☐ |
| B3 | Watch the category pill and save/share chips on the way up | Fade in **with** the pane (task 3 review item a) — not visible full-size on the tiny parked card | ☐ | ☐ |
| B4 | Drag the top card down (don't cross the swipe threshold) | Deck shrinks back into the fan — it does not close/dismiss | ☐ | ☐ |
| B5 | Tap the dim while expanded | Same minimize-to-fan behaviour as B4 | ☐ | ☐ |
| B6 | Minimize and immediately re-expand a few times | No stutter, no card left mid-transform, no double fan | ☐ | ☐ |

**(reasoning)** B7 | The animated `borderRadius` (parked `RADIUS.md`, open `RADIUS['2xl']`) across six cards animating in `expand` | Smooth on both platforms — Reanimated animating `borderRadius` on six layers at once is untested | ☐ | ☐ |

## C · Gestures on the open deck

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| C1 | Tap the top card | Flips to its back, lands exactly edge-on with no pop | ☐ | ☐ |
| C2 | Swipe right past the threshold | Card flies off, saves to wishlist, next card promotes | ☐ | ☐ |
| C3 | Swipe left past the threshold | Card flies off, passes, next card promotes | ☐ | ☐ |
| C4 | Use the pass/save buttons instead of swiping | Same effect as C2/C3 | ☐ | ☐ |
| C5 | Flip to the back, then scroll the back face | Scroll works; the card does not also swipe away | ☐ | ☐ |
| C6 | Flip to the back, then swipe left/right | Still passes/saves — the gesture works on both faces | ☐ | ☐ |
| C7 | Tap a `Button`/`IconButton` on the front face (Join, save, share) | Fires its own action; does not also flip the card (carried-over risk from `DealtCard`, section O of `dealt-event-card.md`) | ☐ | ☐ |
| C8 | Swipe through most of a page (15+ cards) | Next page loads invisibly; deck never visibly empties or stalls mid-swipe | ☐ | ☐ |
| C9 | Swipe until genuinely out of events | `DeckEmptyCard`'s "all caught up" face appears, deck stays on screen | ☐ | ☐ |
| C10 | As a free user, use up the day's swipes | `DeckEmptyCard`'s paywall face appears; tapping its CTA reaches `/premium` | ☐ | ☐ |

## D · "Tap for details" (task 3 review item b)

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| D1 | Expand the deck, wait for the top card's detail to load | "Tap for details" appears above the stack, breathing gently | ☐ | ☐ |
| D2 | Flip to the back | Hint disappears | ☐ | ☐ |
| D3 | Flip back to the front | Hint reappears | ☐ | ☐ |
| D4 | Swipe to the next card before its detail has loaded | Hint is absent until that card's detail arrives — it should not show for a card with no back yet | ☐ | ☐ |
| D5 | Minimize the deck | Hint is gone (chrome fades with `expand`, same as the counter/buttons) | ☐ | ☐ |

## E · The pin's card — should behave exactly as before

`EventDealtCard` now deals exactly one card everywhere it's opened from. This
section is regression coverage: nothing here should look any different than it
did before this batch.

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| E1 | Tap a map pin | One card deals in from the pin, no stack behind it | ☐ | ☐ |
| E2 | Swipe it away (either direction) | Card closes; you're back on the map — it does not advance to another event | ☐ | ☐ |
| E3 | Open a card, tap the bookmark chip to save, then swipe right | Card closes without un-saving (right always saves, never toggles) | ☐ | ☐ |
| E4 | Open a card from the home rail, a friend's profile, search, and the wishlist | Same single-card behaviour at each opener | ☐ | ☐ |
| E5 | Open a card, flip it, check the back face | Roster, join/approve/leave/check-in actions all still work as before | ☐ | ☐ |
| E6 | Trigger the new-host safety popup (join a new host's event) | Still appears over the card, both actions still work | ☐ | ☐ |
| E7 | Leave an event via the card's back face | Confirm dialog → reason sheet flow unchanged | ☐ | ☐ |
| E8 | Push-notification deep link to an event | Card deals in the same way it did before (no origin, comes up off the bottom edge) | ☐ | ☐ |

## F · Android specifics

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| F1 | Fan position relative to the floating tab bar | Sits correctly above it, same tuck as before (`SwipeDeckTeaser` parity) | — | ☐ |
| F2 | Expand the deck | Portal's Android path (plain `<Stack>` sibling) still paints above the map | — | ☐ |
| F3 | Expand the deck with the on-screen nav bar showing | No clipping/misalignment from `SafeAreaView` being a no-op here | — | ☐ |
