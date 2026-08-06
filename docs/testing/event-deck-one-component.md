# The event deck as one component — device test sheet

Covers all four tasks of `2026-08-04-event-deck-one-component` — `EventDeck`
(new), its mount in `app/_layout.tsx`, the removal of `SwipeDeckTeaser` and
`EventDealtCard`'s `isSwipeDeck` branch, and the `emerge`/`FlipHint`
carry-forwards from task 3's review — **and the whole-branch review's fix wave
on top of them**, which is where most of the new rows come from.
**None of this has been run on a device.**
Nothing here is reachable under Jest — Reanimated 4 throws on import — and
`tsc`/`eslint` cannot see a mis-set `pointerEvents` gate, a portal mounted over
the wrong route, or an animation that reads as two things instead of one.

Run on **iOS and Android**. Android is not optional: `CardPortal`'s Android
path is a plain sibling of `<Stack>`, not `FullWindowOverlay` (that's iOS-only)
— section A exists to check that path still paints above the map and the tab
bar on its own.

Tick each row on each platform. A row that cannot be run is **BLOCKED**, not
passed — note it and come back.

**What (reasoning) means here.** Nothing on this sheet has been observed
running, so "not yet seen on a simulator" would describe every row and mark
none of them. It is scoped tighter: a **(reasoning)** row is one where the
*expected result itself* is inferred rather than specified — nobody decided it
should look like that, it is what reading the code says should happen, so the
row is as likely to be wrong about the expectation as the code is to be wrong
about the behaviour. If one fails, question the row before filing the bug.
Rows without the tag have an expectation taken from the design doc, from the
behaviour being deliberately preserved, or from a bug whose symptom is already
written down.

**What changed, so you know where to look:**

| Area | Change |
| --- | --- |
| `EventDeck.tsx` | New. The map's "Up for it?" fan and the swipe deck it opens, as one component with two sizes (`expand`, 0→1), root-mounted in `app/_layout.tsx`. |
| `SwipeDeckTeaser.tsx` | Deleted. Was the fan; `EventDeck`'s minimized state replaces it. |
| `EventDealtCard.tsx` | Stripped to one card, no stack. `isSwipeDeck`, the quota, `DeckChrome`, `DeckEmptyCard`, `originTilts`, the exhausted state, and the background-face stack machinery (`BackgroundFace`, `useCachedEventSummary`) are all gone — a pin's card deals one event and closes on a swipe. |
| `uiStore.ts` | `swipeDeckOrigin`/`setSwipeDeckOrigin`, `dealtCard.origins`, and the `DealtCardSource`/`source` discriminant are gone — nothing produced `'swipeDeck'` once the teaser was deleted. |
| `EventCard.tsx` | `emerge` now fades the category pill and the save/share chips along with the pane, not just the pane (task 3 review item a). |
| `DealtCard.tsx` | `FlipHint` ("Tap for details") exported and reused by `EventDeck` (task 3 review item b). |

**Then the whole-branch review's fixes, which is most of what is new here:**

| Area | Change |
| --- | --- |
| `EventCard.tsx` | **Regression fix.** `paneWrap` was an `absoluteFill` last child with no `pointerEvents`, covering the pill and the save/share chips — a tap on the bookmark hit the wrapper and stopped. Wrapper deleted. Affects the **pin's card** as much as the deck's; see E9/E10. |
| `DeckEmptyCard.tsx`, `DeckChrome.tsx` | Both pushed `/premium` from inside `CardPortal`'s window overlay, so the paywall mounted *underneath* the deck. Both now take `onBeforeNavigate`, which `EventDeck` wires to `minimize`. See C10/C11. |
| `EventDeck.tsx` | "Tap to retry" now actually refetches, and the error card gained a "Try again" button (C12). The wishlist save/unsave toast is back on the deck (C13). The top card's BlurView is gated on `expanded`, so a parked fan composites no blur (B8). The fan's entrance animation is restored (B9). |
| `dealtCardGeometry.ts` | `DIM_OPACITY`, `TAP_SLOP`, `CARD_SHADOW_OPACITY`, `CARD_ELEVATION` and `haptic()` were copied into both `DealtCard` and `EventDeck`; they are shared now. `expandedSlot` also silently dropped `stackLayer`'s `shade`, which `EventDeck` re-typed as a literal — both surfaces read the same value now (B10). |
| `uiStore.ts` | `advanceDealtCard` deleted and `dealtCard.ids`/`index` collapsed to a single `id`. Fifteen call sites across ten opener files changed — E4 is now load-bearing rather than a formality. |

**Known, not fixed here:** `DeckActions`' undo button is inert for **premium**
users (task 3 review item c, confirmed by grep — ticketed separately, out of
scope for this batch). It always reads `canUndo: false` because
`useSwipeDeck()`'s `history` is local per call site, and the deck's own swipes
go through `useRecordSwipe()` instead. The *free* user's undo path was a
separate bug and is fixed (C11).

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
| A9 **(reasoning)** | While the fan is **parked** (not expanded), tap the map underneath/around it | Map pans and responds normally — the parked dim must not be eating touches | ☐ | ☐ |

**A9 is the one to watch closely.** The dim is a full-screen view at opacity 0
while parked, gated `pointerEvents={expanded ? 'auto' : 'none'}`. If that gate
is backwards the map stops responding entirely and nothing on screen explains
why.

### A′ · What the parked fan actually looks like

Nothing above checks the fan's own appearance — only where it is and what it
covers. The fan is now made of the same full-size `EventCard`s the open deck
uses, scaled down, rather than the deleted teaser's bare `<Image>`s, so its
contents are worth a look in their own right.

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| A10 | Look at the parked fan with events available | Three minis, leaning different ways, each showing its **event photo**. A white edge and a rounded corner on each, "Up for it?" pill top-left, count badge top-right | ☐ | ☐ |
| A11 | Find or create an event with **no photo**, and get it to the front of the deck | The mini shows the `ActivityGlyph` fallback on its category tint — not a blank or black rectangle | ☐ | ☐ |
| A12 **(reasoning)** | Look closely at a parked mini for any card furniture | **No** category pill, host row, title or glass pane on the mini itself — `emerge` holds all of it at 0 while parked, and it should be a bare photo. The "Up for it?" pill is separate chrome and *should* be there | ☐ | ☐ |
| A13 | Use up the day's swipes as a free user, then leave the deck parked | Fan is still there in the same place, showing the placeholder emoji faces, labelled **"Out of swipes"** | ☐ | ☐ |
| A14 | Swipe through everything until genuinely caught up, then minimize | Fan still there, emoji faces, labelled **"All caught up"**, and the count badge is gone | ☐ | ☐ |
| A15 | Kill the network and open the map | Fan shows, labelled **"Tap to retry"** (see C12 for what the tap must do) | ☐ | ☐ |

A13–A15 matter because the fan is the app's only entry point to the deck. The
teaser it replaced deliberately never vanished — an entry point that disappears
when there is nothing behind it teaches people to stop looking there.

## B · Expand and minimize — the whole point of the merge

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| B1 | Tap the fan | Reads as **one object growing**, not the fan disappearing and a different stack appearing | ☐ | ☐ |
| B2 | Watch the glass pane, title, host row and CTA as it grows | Arrive over the **last third** of the growth, not all at once and not from frame one | ☐ | ☐ |
| B3 | Watch the category pill and save/share chips on the way up | Fade in **with** the pane (task 3 review item a) — not visible full-size on the tiny parked card | ☐ | ☐ |
| B4 | Drag the top card down (don't cross the swipe threshold) | Deck shrinks back into the fan — it does not close/dismiss | ☐ | ☐ |
| B5 | Tap the dim while expanded | Same minimize-to-fan behaviour as B4 | ☐ | ☐ |
| B6 | Minimize and immediately re-expand a few times | No stutter, no card left mid-transform, no double fan | ☐ | ☐ |
| B7 **(reasoning)** | Watch the corners through a full expand — the `borderRadius` animates from parked `RADIUS.md` to open `RADIUS['2xl']` on six card layers at once | Smooth on both platforms, corners round out with the growth | ☐ | ☐ |
| B8 **(reasoning)** | Expand, then minimize, and watch the glass pane's frostiness as it goes each way | The pane's blur is only present while open. Going down it may visibly flatten — that is the gate working, and it should happen while the pane is already near-invisible, not as a pop on a legible pane | ☐ | ☐ |
| B9 | Arrive on the map tab (from another tab, and from a cold start) | The fan **fades in and rises** into place after a short beat, rather than appearing instantly fully formed | ☐ | ☐ |
| B10 **(reasoning)** | Expand the deck and compare the shading of the cards behind the top one against the pin's card stack | Same darkness on both surfaces. They read the same `shade` value now; before, the deck used a hardcoded copy | ☐ | ☐ |
| B11 | Tap the fan **during** its entrance (within the first second of arriving on the map) | Expands normally from wherever it currently is — no jump back down, no fighting between the entrance and the growth | ☐ | ☐ |

**B9 and B11 go together.** The entrance is a shared value multiplied into the
cards' opacity and translateY, not an `entering` prop — because both views that
could carry one remount for reasons that are not "the map opened" (the label
unmounts on every expand, and each card is keyed by event id, so every swipe
would replay it). B11 is what proves the multiply is right; if the entrance
replays on every swipe or every minimize, that is the same bug from the other
side.

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
| C10 | As a free user, use up the day's swipes, then tap the paywall card's "Get Mello+" CTA | **The deck minimizes back to the fan and `/premium` is on screen.** This is the fix: the paywall is a pushed route and the deck sits in a window-level overlay, so without minimizing first the route mounted *underneath* and the tap looked dead — then the paywall appeared from nowhere when you later tapped the dim | ☐ | ☐ |
| C11 | As a **free** user with the deck open, tap the undo button | Same as C10 — deck comes home, `/premium` is visible. Same bug, second entry point | ☐ | ☐ |
| C12 | Kill the network, open the map, tap the fan (label reads "Tap to retry"), then restore the network and tap "Try again" on the error card | The tap on the fan refetches *and* expands; the error card has a working "Try again" that reloads the deck. Previously the label promised a retry, the tap only expanded, and the error card had no button at all | ☐ | ☐ |
| C13 | With the deck open, tap the top card's bookmark chip — once to save, again to unsave | A toast appears above the pass/save/undo row: "Added to wishlist" / "Removed from wishlist". Turn the network off and try again: "Couldn't update wishlist" | ☐ | ☐ |
| C14 **(reasoning)** | After C13's toast appears, minimize the deck before it times out | Toast goes with the deck rather than being left floating over the map | ☐ | ☐ |

**C13 is not cosmetic.** The save is optimistic and rolls back silently on
failure, so without the toast a failed save flips the bookmark on and then off
and "reads as the button does nothing" — the reason the pin's card has had this
toast all along. The deck's chip had been exactly that case.

## D · "Tap for details" (task 3 review item b)

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| D1 | Expand the deck, wait for the top card's detail to load | "Tap for details" appears above the stack, breathing gently | ☐ | ☐ |
| D2 | Flip to the back | Hint disappears | ☐ | ☐ |
| D3 | Flip back to the front | Hint reappears | ☐ | ☐ |
| D4 **(reasoning)** | Swipe to the next card before its detail has loaded | Hint is absent until that card's detail arrives — it should not show for a card with no back yet | ☐ | ☐ |
| D5 | Minimize the deck | Hint is gone (chrome fades with `expand`, same as the counter/buttons) | ☐ | ☐ |

## E · The pin's card — should behave exactly as before

`EventDealtCard` now deals exactly one card everywhere it's opened from. This
section is regression coverage: nothing here should look any different than it
did before this batch.

**Every row in this section is (reasoning) by construction** — the expectation
is "identical to before", which nobody has written down anywhere and which is
inferred from the change being meant not to touch this surface. Two things make
that inference weaker than it sounds. The front face's chip bug (E9) was a real
regression on exactly this card, and it sat in this section's blind spot: every
row below the line was about the *back* face or about dealing, and none looked
at the front face's own controls. And the `uiStore` refactor changed all ten
openers, which is what E4 now covers.

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| E1 | Tap a map pin | One card deals in from the pin, no stack behind it | ☐ | ☐ |
| E2 | Swipe it away (either direction) | Card closes; you're back on the map — it does not advance to another event | ☐ | ☐ |
| E3 | Open a card, tap the bookmark chip to save, then swipe right | Card closes without un-saving (right always saves, never toggles) | ☐ | ☐ |
| E4 | Open a card from **each** opener: map pin, home rail ("Happening near you"), the home feed's nearby list, a friend's profile, your own Profile tab, search, the wishlist, the community events rail, a push notification, and a deep link | A card opens showing **the event you tapped** at every one. All ten call `dealCard` with a single id now instead of an array plus an index; picking the wrong element would show a neighbouring event, which looks like a data bug rather than a refactor slip | ☐ | ☐ |
| E5 | Open a card, flip it, check the back face | Roster, join/approve/leave/check-in actions all still work as before | ☐ | ☐ |
| E6 | Trigger the new-host safety popup (join a new host's event) | Still appears over the card, both actions still work | ☐ | ☐ |
| E7 | Leave an event via the card's back face | Confirm dialog → reason sheet flow unchanged | ☐ | ☐ |
| E8 | Push-notification deep link to an event | Card deals in the same way it did before (no origin, comes up off the bottom edge) | ☐ | ☐ |
| E9 | **Open a card from a map pin and tap the bookmark chip, then the share chip** | Bookmark fills in / empties; share opens the share sheet | ☐ | ☐ |
| E10 | On the same card, tap the category pill top-left, and tap the Join CTA | Pill is inert (it is a label, and should swallow nothing); Join does its normal thing | ☐ | ☐ |
| E11 | Do E9 again on the **deck's** top card | Same — both chips respond there too | ☐ | ☐ |

**E9 is the row this sheet was missing.** Both chips were dead on every card in
the app: an `absoluteFill` pane wrapper with no `pointerEvents` sat over them as
the last child, and RN hit-tests topmost-first. It read as chip-specific
because the Join CTA (inside the pane) and the tap-to-flip (an RNGH gesture on
an ancestor, which bypasses the responder system) both still worked — which is
also why E10 is worth doing in the same pass rather than assuming.

## F · Android specifics

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| F1 | Fan position relative to the floating tab bar | Sits correctly above it, same tuck as before (`SwipeDeckTeaser` parity) | — | ☐ |
| F2 | Expand the deck | Portal's Android path (plain `<Stack>` sibling) still paints above the map | — | ☐ |
| F3 | Expand the deck with the on-screen nav bar showing | No clipping/misalignment from `SafeAreaView` being a no-op here | — | ☐ |

---

## F · The flip's depth fight, and the mirrored face (2026-08-07)

Two bugs reported together on the open deck. Both are fixed; neither is verified.

**What was wrong:**

1. **The card below showed through, with a vertical band down each side
   mid-turn.** The card's transform carries `perspective`, so under `rotateY`
   its halves genuinely move in z — and its siblings in the stack are flat
   planes at z = 0 in that *same* space. The half turning away was depth-sorted
   behind the next card. Paint order cannot fix that, because the compositor is
   not using paint order. This is the identical failure the **dim** hit and
   solved with its own wrapper (`dimWrap`); the cards never got the same
   treatment.
2. **The photo came back mirrored.** Closing the deck mounted the front face
   without turning the card back — `setBackMounted(false)` with `flip` left at
   1 — and a 180° box renders its contents mirrored. `flip` was only reset in
   `flingOff`, i.e. by swiping the card away, which is the one exit nobody takes
   when they just want to close the deck. It survived reopening, too.

**The fixes:** an untransformed `layerBox` wrapper per card, with an explicit
`zIndex`, so each card's rotation resolves inside its own compositing context
and the stack sorts by order rather than by depth. The cards underneath also now
fade out through the turn (the shadow's `sin` curve, reused) — correct
compositing stops the stack *interleaving* with the flip, but at 90° the top card
is a sliver and a stranger's photo would still fill the screen behind it.
`minimize` resets `flip`, and became a plain function to do it — see its comment
for why a `useCallback` there poisons every other write to `flip` in the file.

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| F1 | Open the deck, flip the top card. Watch the **edges** through the turn | Clean rotation. No vertical band down either side, no seam, no slice of the next card's photo appearing through the turning one | Any hard-edged band — the wrapper is not isolating the card | ☐ | ☐ |
| F2 | Same, watching the **cards behind** | They fade out as the top card turns and come back as it lands. At 90° the backdrop is the dim, not another event | Another card visible edge-on | ☐ | ☐ |
| F3 | Flip, then flip back | Both directions clean, no ghosting at the crossing | ☐ | ☐ | |
| F4 | Flip to the back, then tap **outside** the card to send the deck home. Open it again | The front, the right way round. The photo, title and buttons are **not** mirrored | Mirrored content — the reset did not run on that exit | ☐ | ☐ |
| F5 | Flip to the back, then fling the card **down** to close | Same as F4 | ☐ | ☐ | |
| F6 | Flip to the back, then swipe the card **away** (left or right) | The next card arrives front-facing, unmirrored — this path always worked, and must keep working | ☐ | ☐ | |
| F7 | Flip to the back, then tap a safety popup's "View host profile" | The deck comes home, the profile pushes, and coming back shows a front-facing deck | ☐ | ☐ | |
| F8 | With the deck **parked** in the corner, check the fan | Three cards, correct order, shadows intact. The new per-card wrapper must not have changed the fan's geometry | Cards mis-stacked, mis-centred, or shadowless | ☐ | ☐ |
| F9 | Tap the dim behind an open deck | Still closes. The wrappers are `box-none`; if the topmost one swallows the tap, the dim stops working | ☐ | ☐ |
| F10 | Swipe, drag, and long-press the top card | All gestures still land — the detector now sits inside the wrapper | ☐ | ☐ |

---

## G · The swipe hint and the first-run demo (2026-08-07)

The deck's gesture had no affordance: the two buttons underneath do the same
job, so it was possible to use the whole feature without learning the card can
be thrown — or that throwing it *right* is what fills your wishlist.

Three parts, and **none of them is text**:

**Badges on the card.** A coral bookmark to the right, a dark cross to the left,
fading and growing in as the card travels that way (`BADGE_FULL_AT`, well inside
the commit threshold). They earn their place outside the tutorial too: a drag had
no feedback at all before — you found out what a swipe did by completing one.

**The first-run demo.** On the first open ever, the top card swings right far
enough to light the save badge, holds it long enough to read, comes back, and
does the same to the left. That is the entire tutorial.

**The idle nudge.** After that, the card rocks right → left → settles once every
4s while the deck is open, until the first swipe of the session retires it.

All three ride one shared value (`nudge`), which is deliberately **not** `dx`:
`dx` belongs to the pan, and a hint written into it would be indistinguishable
from a real drag to the threshold, the rotation and the commit. It also means no
animation can ever throw a card by itself. A real drag fades the hint out over
its first 40pt (`NUDGE_YIELD`), so finger and hint never fight over a pixel.

One effect owns the channel and picks between demo and nudge — every write to a
shared value has to be in a single hook, or React's immutability rule rejects the
second one. (The same rule the flip hit; see `minimize`.)

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| G1 | Fresh install (or clear app data), open the deck for the first time | After a beat, the card swings **right** — coral bookmark lights up — holds, returns; then **left** — dark cross — holds, returns | Nothing moves, or it starts before the deck has finished growing | ☐ | ☐ |
| G2 | Watch the badges during the demo | Each fades and scales in as the card travels, fully lit at the hold, gone by the time it is centred | A badge that pops on, or one that stays lit | ☐ | ☐ |
| G3 | Close and reopen the deck. Then kill the app and reopen | The demo does not replay. The idle nudge runs instead | It replays — the flag is not being written | ☐ | ☐ |
| G4 | Sign out, sign in as someone else, open the deck | The demo runs again — the flag is per user | ☐ | ☐ | |
| G5 | Interrupt the demo: swipe a card while it is mid-swing | Your swipe wins immediately, no fight over the card | The card stutters or snaps back | ☐ | ☐ |
| G6 | After the demo, watch the top card for ~8 seconds | A small rock right → left → settle, roughly every 4s, with a slight tilt — the same ratio a real drag tilts at | No movement, a slide with no tilt, or a fidget faster than ~4s | ☐ | ☐ |
| G7 | Start dragging mid-rock | The card follows your finger cleanly, no jump as the hint gets out of the way | A visible snap at touch-down | ☐ | ☐ |
| G8 | Drag slowly right, then left, without releasing | The badges light and dim with the travel, and swap sides as you cross the middle | Both lit at once, or one stuck on | ☐ | ☐ |
| G9 | Swipe one card away, then watch | The nudge **stops** for the rest of the session. One line (`swipedOnce`) if it should keep going | It keeps rocking | ☐ | ☐ |
| G10 | Close the deck and reopen (without swiping) | The nudge resumes | ☐ | ☐ | |
| G11 | Flip a card to its back, then watch | No rocking while flipped or mid-flip — the two would fight over the same transform | The back face rocking | ☐ | ☐ |
| G12 | The **parked fan** on the map | Its own slow breathing (`sway`), unchanged. No rocking, no badges | Badges visible on the fan | ☐ | ☐ |
| G13 | With the deck open and idle, leave it alone for a minute | A hint never commits a swipe on its own — 14pt (or the demo's 78) against a threshold of 28% of the screen | A card leaving by itself | ☐ | ☐ |
| G14 | Reduced Motion on (Settings → Accessibility) | **Known gap:** neither the demo nor the nudge is gated on it, unlike the skeletons. Note whether they read as intrusive | — | ☐ | ☐ |
