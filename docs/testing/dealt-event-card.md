# The dealt event card — device test sheet

Covers the branch that replaced the event bottom sheet with a "dealt card":
dealt out of whatever element you tapped, arcing to centre screen over an
80% dim, with four more cards thrown messily behind it, flipping on a tap,
swipeable as a deck. Ten tasks, `progress.md` in
`.superpowers/sdd/2026-08-03-dealt-event-card/` is the full record.

**Nothing in this branch has been run.** `npm run typecheck` (0 errors),
`npm test` (338 passing) and `npm run lint` (0 errors / 67 warnings) are all
green, and none of the three can see any of it — Reanimated 4 throws on
import under Jest, so no component here has a unit test, and this feature has
no screen-test coverage at all. This sheet is the only record of what was and
was not verified.

Run on **iOS and Android**. Tick each row on each platform. A row that
cannot be run is **BLOCKED**, not passed — note it and come back.

**Run sections O and P first.** They were added by the final whole-branch
review and are the two highest-risk sections here — P is "does the card appear
at all from three of the screens that open it", O is "do any of the buttons on
it work". Both are new letters rather than an insert at the top, so that every
row that has already been referenced elsewhere keeps its name. Letters are
identity on this sheet, not order.

Ordered by **risk**, not by feature — highest-risk first. Each row says
explicitly whether it checks **reasoning** (the code was read and traced, but
never watched running) or is **pure conjecture** (nobody has reasoned about
runtime behaviour at all, e.g. framerate — the code is straightforward, the
risk is entirely "does the platform keep up").

**Setup:**

| Need | Why |
| --- | --- |
| A device that can toggle airplane mode / kill data mid-action | Section D (quota), section H (wishlist toast failure path) |
| A women-only event you can view as host, as a joined member, and as a non-member | Section G |
| A way to get more than 10 km from an event, or a Mello+-gated one nearby, as a non-premium account | Section G3 |
| An account that has never seen the four safety flags (first join, women-only, new host, party/alcohol) | Section I |
| The map screen with at least 5 pins visible in one viewport | Sections A, B |
| A saved draft push notification or the ability to trigger one, and a deep link into an event | Section E |

---

## A · Motion and framerate — pure conjecture, never watched

Nobody has run this feature. These rows exist because the design spec
(§7 "Android") names them as the known unknowns going in, not because
anything specific was observed going wrong.

| # | Step | Expect | Failure looks like | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| A1 | Tap a map pin (or any card) to deal a card, then tap it once to flip | The flip cross-fades smoothly through the edge-on point, no stutter | Visible frame drop, a stall at the 90° crossing, or momentarily seeing both faces overlaid ("ghosting") — the cross-fade exists specifically to avoid the `backfaceVisibility` version of this bug, so ghosting here would mean the fix itself is broken | ☐ | ☐ |
| A2 | With a full deck dealt, flip the top card several times in a row, then swipe through 3-4 cards | Consistently smooth, no dropped frames, no lag between touch and response | Visible jank, a noticeable delay between your swipe and the card responding, or the app feeling "heavy" specifically once a full deck is mounted (vs. feeling fine with 1 card) | ☐ | ☐ |
| A4 | Open the deck fresh and watch the first card deal in | Arcs in with a lift at the midpoint and a small overshoot at the end — reads as thrown, not slid | Looks like a slide/fade instead of an arc, or the overshoot is invisible/absent | ☐ | ☐ |

**A1 and A2 are the two highest-risk *framerate* rows on this sheet** (O and P
above them are correctness, not performance). 3D `rotateY` work over a
full-bleed `expo-image`, times the cards mounted simultaneously, is exactly the
kind of cost that shows up on mid-range Android and not on a new iPhone. If
either is bad, that is a real product problem, not a nitpick.

**How much is actually mounted, corrected twice.** A2 originally said "5 cards,
all with photos". Two later changes moved the number in opposite directions:

- **The stack is now the swipe deck's alone.** Tapping a pin, a feed card or a
  search result opens a single card with nothing behind it. So off the swipe
  deck, A1–A3 are measuring **one** card face and one photo, and any framerate
  problem there is a problem with the flip itself, not with stacking.
- **On the swipe deck it is six faces, not five** — the top card, four visible
  behind it, plus one parked at opacity 0 so it can fade in as the stack
  shortens rather than popping in (design §6; `dealtCardGeometry.ts:55`, made
  reachable in the fix wave). Six `expo-image`s, five rotated and scaled.
- **`EventCardBack` still mounts as soon as a card is dealt, not on flip.** It
  is cross-faded, not conditionally rendered, so it is laying out behind a face
  you cannot see from the first frame of the deal. Since the "happening near
  you" rail was cut it no longer carries a second row of photos — the back is
  now text, avatars and buttons.

So the worst case is six images on the swipe deck and one everywhere else. If
A2 still fails, the first thing to try is gating `EventCardBack`'s mount on the
flip having started.

## B · The glass panel's Android degradation — reasoning, partially observed

`Glass`'s `flat` prop (Task 5) forces `Platform.OS === 'ios' && !flat` false
on Android by construction — this is existing, already-shipped `Glass`
behaviour that this branch reuses rather than invents, so it is closer to
"read and confirmed" than "never reasoned about." What's new is that the
*deck* only gives one card a real blur.

| # | Step | Expect | Failure looks like | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| B1 | On Android, deal any card and look at the front face's content panel (the `Glass` `onPhoto` pane over the photo) | A flat, translucent dark fill behind the text — no true blur, but legible and not jarring | The panel looks broken (fully opaque, fully transparent, or the wrong colour) rather than merely flatter than iOS's blur | ☐ | ☐ |
| B2 | On iOS, do the same comparison | A true backdrop blur — visibly softer/frostier than Android's flat fill | *Reference point, not a check* — this row can't fail on its own; it exists only so B1's "flatter than iOS" comparison has something to compare against. Don't hunt for a failure condition here | ☐ | ☐ |
| B3 | With a full deck dealt, check the four cards behind the top one | They are a flat dimmed fill (82% brightness per spec §6), not blurred, on **both** platforms — only the top card gets a real `Glass` blur | A background card shows a real blur (wasted cost) or looks undimmed/identical to the top card | ☐ | ☐ |
| B4 | Deal a deck from **search results**, from a **friend's profile**, and from your own **Profile** tab, then look at the four cards behind the top one | Each shows a real event card (photo, title, host) | Blank rectangles. Those three screens' feeds were missing from the dealt deck's cache list, so every background card fell through to the placeholder and the "visible messy stack" was four empty boxes. The list moved to `queryKeys.ts` as `EVENT_SUMMARY_CACHE_KEYS` and the three keys were added — this checks that the prefixes actually match at runtime, which is the half a type checker cannot see | ☐ | ☐ |
| B5 | With a deck of more than five events, look under the stack, then swipe through it | A "N more behind" count sits under the card and counts down as you swipe (design §6). The deepest card in the stack fades in as the stack shortens rather than appearing at full opacity | Count missing, wrong, or still showing at 0; or a card visibly pops into existence behind the stack instead of fading in | ☐ | ☐ |

> **B3, B4 and B5 are superseded — do not run them.** They test a many-deep
> stack behind the pin's card, and there is no longer one: `EventDealtCard`
> deals a single card with nothing behind it, and the many-deep stack moved to
> `EventDeck` (see `event-deck-one-component.md`, section B). B4 in particular
> tested `EVENT_SUMMARY_CACHE_KEYS`, the prefix list a background card looked
> itself up in — that list and its one consumer, `useCachedEventSummary`, are
> both deleted, because the deck's stack now renders straight off the live rows
> `useSwipeDeck` already holds and nothing scans a cache by prefix. B5's "N more
> behind" count was cut separately, for its own reasons (see `DealtCard.tsx`).
> B1 and B2 still stand: the front face's `Glass` pane is unchanged.

## C · Haptic timing — pure conjecture, against a scheme that was short and is now fixed

This section was originally written against the design spec's five-moment
haptic table (§3). A review checked it against the actual code
(`src/components/ui/DealtCard.tsx`, `src/stores/uiStore.ts`) and found only
three of the five moments existed — the touch-down tick was missing
entirely, and the threshold crossing and the commit were collapsed into one
`selectionAsync()` fired at release. That was a real gap on the branch's
headline feature, not a sheet error, and it has been fixed rather than
written around: commit `4504f8d` implements all five.

**What's there now, reading `DealtCard.tsx` and `uiStore.ts` as they stand:**

- **Touch-down** fires from `uiStore.ts`'s `dealCard` action itself
  (`Haptics.selectionAsync()`), not from the card — one call site for all
  twelve openers, deep link included. It fires on a fresh **deal** only;
  `advanceDealtCard` (swiping to the next card in a deck) does not call it.
- **Land** and **flip** (`DealtCard.tsx`'s `haptic('land')` / `haptic('flip')`)
  are unchanged by the fix — already existed, already reasoned as correct.
- **Threshold** is now a latch (`thresholdArmed`, a shared value) inside the
  pan gesture's `onUpdate`, not a check made once at release: it fires the
  instant a drag first crosses the commit threshold, while the finger is
  still down, then disarms so it doesn't refire every subsequent frame past
  the line. Falling back under the threshold re-arms it.
- **Commit** (`haptic('save')`, a `notificationAsync(Success)`) now only
  fires for a **right** swipe (save). A left swipe (pass) gets no commit
  haptic at all — the threshold tick already told the finger the swipe took,
  and a pass is not a success.

None of this has been felt on a device. C1-C2 are the original,
already-reasoned moments; C3-C6 are new code, entirely untested until now.

| # | Step | Expect | Failure looks like | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| C1 | Deal a card and pay attention to the exact instant it visually stops moving (~560ms in) | A medium haptic thud lands **on that frame** — not noticeably before (card still moving) or after (a beat of nothing, then a buzz) | The thud is early, late, or you can't correlate it to a specific moment at all | ☐ | ☐ |
| C2 | Tap to flip and watch the card cross edge-on | A light haptic click lands right at the edge-on crossing, not at the start or end of the flip | Click is off-sync with the crossing | ☐ | ☐ |
| C3 | Touch down on a pin/card and hold for a moment before releasing | A light selection haptic on touch-down itself, before the card has even started moving | No haptic on touch-down at all — the exact feature gap this row exists to catch a second time | ☐ | ☐ |
| C4 | Drag a card sideways past the swipe threshold in one continuous motion, without releasing | **One** distinct tick the instant it crosses the threshold — not a buzz, not a repeating pulse as you keep dragging further past the line | The tick repeats continuously (fires every frame instead of once) while you hold past the threshold — this is the most likely way the latch goes wrong | ☐ | ☐ |
| C5 | Drag past the threshold (feel the tick), then **without releasing**, pull the card back under the threshold, then push past it again | A **second**, distinct tick on the second crossing — the latch re-arming | No second tick (latch never re-arms), or it ticks continuously the whole time regardless of crossing back and forth | ☐ | ☐ |
| C6 | Swipe a card fully right until it commits (saves), then repeat with a full left swipe (pass) | Right swipe: a success notification haptic (a distinctly different, slightly longer buzz than the selection tick) lands as it commits. Left swipe: **no haptic at all** at commit — only the threshold tick you already felt on the way there | A commit haptic on the **left** swipe too — this is not a bug you should report if you feel nothing on a pass; that silence is correct. Report it only if the **right**-swipe success buzz is missing, or if the pass also produces one | ☐ | ☐ |

## D · The quota trap — reasoning, traced end-to-end by a reviewer; this row confirms it on a device

This is the single named risk the design spec calls out by name (§6, §9) and
the one a reviewer traced most concretely in code: `uiStore.dealtCard` carries
a `source: 'browse' | 'swipeDeck'` discriminant that survives every advance
through the deck (Task 8's report: "Reviewer traced concretely that no browse
path can reach `recordSwipe`"). Every opener except `app/events/swipe.tsx`
defaults to `'browse'`. The device check exists because a discriminant that
is correct by inspection can still be wired to the wrong prop at a call site
no reviewer's grep happened to catch.

| # | Step | Expect | Failure looks like | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| D1 | Note your swipe count on `app/events/swipe.tsx` (the "N free swipes" text), then back out to the map | Count is visible and stable | — | ☐ | ☐ |
| D2 | On the map, tap a pin to deal a card, then **swipe right** (save) on it, and on 2-3 more cards behind it in the same deck | Each save adds the event to your wishlist (check the wishlist screen), advances to the next card | An event you swiped right on is missing from the wishlist, or the deck doesn't advance to the next card (stuck on the same one, or the deck closes early) | ☐ | ☐ |
| D3 | Return to `app/events/swipe.tsx` and check the swipe count | **Unchanged from D1** — a map-dealt swipe must not decrement `swipesLeft` | Count has gone down — this is the exact bug the discriminant exists to prevent | ☐ | ☐ |
| D4 | Now open the **swipe deck itself** (`app/events/swipe.tsx`) and swipe right on its own top card | Wishlist-save behaves the same, **and** the swipe count decrements this time | Count doesn't move — the deck's own quota-spending is broken | ☐ | ☐ |
| D5 | Repeat D2-D3 from the wishlist screen and from the home "Tonight near you" card (two more `'browse'` openers) | Same as D3 — no quota change | Quota decrements from either | ☐ | ☐ |
| D6 | On a non-premium account with **exactly one** swipe left, open the swipe deck, tap its top card to deal it, then swipe the dealt card **twice** | The first swipe records; the second is refused — the card closes and you land on `/premium?reason=swipes`. Nothing is written for the second event, and (for a right swipe) it does **not** appear in your wishlist | The second swipe commits and the deck advances anyway. That was the bug: `useRecordSwipe` carried none of the deck screen's cap, so the optimistic bump went through, the DB trigger rejected it, `onError` only logged — and for a 'like' the uncapped wishlist save still landed, leaving the two halves of one swipe disagreeing | ☐ | ☐ |
| D7 | Same account, now out of swipes entirely, deal a card from the swipe deck and try to swipe it | Straight to `/premium?reason=swipes`, card closed | The card stays open half-flung off screen, or the swipe silently does nothing and the card snaps back | ☐ | ☐ |

## E · Origins — mixed: E1-E2 reasoning, E3 pure conjecture

| # | Step | Expect | Failure looks like | Checks | iOS | Android |
| --- | --- | --- | --- | --- | :-: | :-: |
| E1 | Start panning the map, and **while it is still moving**, tap a pin | Card deals from where the pin visually was at the moment you tapped, not from a stale or offset position | Card appears to fly from empty space, or from noticeably the wrong spot on screen | conjecture — `mapOffset` (the container's screen position) is measured once on layout, not per-tap; `pointForCoordinate` is awaited live at tap time, but the gap between that await resolving and the animation reading it, while the map keeps moving, has never been watched | ☐ | ☐ |
| E2 | Tap a pin near the very top or bottom edge of the map viewport | Origin rect still lands on the actual pin position, not clipped or offset by the status bar / tab bar | Card deals from a point visibly above/below the real pin | reasoning — `pointForCoordinate` + `mapOffset` math was read, not device-verified | ☐ | ☐ |
| E3 | Tap an event from a **deep link** (or, if unavailable, from a push notification after swiping the in-app banner away first so it's no longer on screen) | Card is "flicked up from below screen" — flies in from the bottom edge at scale 0.55, −14°, same 620ms arc as any other deal, **not** a plain slide-up or a snap-into-place | Card appears with no motion, or slides up flatly with no arc/overshoot | conjecture — code path exists (`origin: null` triggers the bottom-edge arc per spec §4) but never watched | ☐ | ☐ |
| E4 | Tap an in-app notification banner **while it is still on screen** | Card deals from the banner's own rect (measured just before the banner unmounts) | Card deals from the bottom edge instead — would mean the pre-unmount measurement in `InAppNotification.tsx` didn't win the race | conjecture | ☐ | ☐ |

## F · The gesture race at the flip crossing — reasoning, fixed but never exercised

Task 6's review found that force-disabling the pan gesture mid-drag (when a
tap flips the card while a drag was starting) could skip the neutral
`dx`/`dy` reset entirely, freezing a stale offset. It was fixed by moving the
reset into `.onFinalize()` guarded by a `settling` shared value, and the fix
was re-reviewed by tracing RNGH's actual onEnd-before-onFinalize ordering
guarantee on the UI thread — not by running it. This row is that trace's
first real exercise.

| # | Step | Expect | Failure looks like | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| F1 | Start dragging the top card sideways, and — mid-drag, before releasing — tap it (or otherwise trigger a flip while still touching) | The drag is cleanly abandoned; the card either flips normally or returns to a neutral centred position with no leftover offset | Card ends up stuck partway off-centre, tilted, or otherwise visibly "frozen" at the drag position it had when the flip took over | ☐ | ☐ |
| F2 | Repeat F1 several times in a row, varying how far you'd dragged before the flip triggers | Every attempt recovers cleanly — no cumulative drift, no card that ends up permanently offset | Any single repetition leaves the card stuck | ☐ | ☐ |
| F3 | After F1/F2, flip back to the front and try a normal swipe (pass/save) | Swipe behaves completely normally, as if nothing unusual happened | Swipe threshold feels off, or the card doesn't fully commit/return | ☐ | ☐ |

## G · Restored capability #1 — the badges (women-only, host verified, Mello+)

G1-G3: Task 9's review found the sheet's "Female-only event" pill had no equivalent
on the new card at all — a host or member of their own women-only event had
zero indication of it. Restored unconditionally off `event.women_only`, with
no membership check. The device row exists because "reads `event.women_only`
directly" is a one-line diff a reviewer confirmed by reading, but nobody has
looked at the actual pill rendering for all three roles.

G4-G6: the final whole-branch review found the same shape again with the host's
verified tick and Mello+ crown — both on the deleted sheet's host row
(`EventBottomSheet.tsx:1257-1258`), both still rendered on the *browse* cards
(`SwipeCard.tsx:93`, `app/(tabs)/index.tsx:246`), and neither on the card that
replaced the sheet. So the two signals that most change a join decision were
missing from the one surface where that decision is made. Restored on
`EventCard`'s host row, which is also a layout change to that row (the name is
now the only part that shrinks) — hence G6.

| # | Step | Expect | Failure looks like | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| G1 | Open a women-only event as its **host**, flip to the back | "Female-only event" pill visible near the top of the back face | Pill missing for the host | ☐ | ☐ |
| G2 | Open the same event as an **approved joined member** (not the host) | Same pill, still visible | Pill missing for a member | ☐ | ☐ |
| G3 | Open the same event as a **non-member** | Same pill, plus (if applicable) the "Beyond your 10 km — join with Mello+" pill when you're far away on a non-premium account and not pending | Either pill missing, or the distance pill wrongly shows for the host/a member | ☐ | ☐ |
| G4 | Open an event hosted by a **KYC-verified** host, front face | The blue verified tick sits directly after the host's name, before "is hosting" — the same place it appears on the swipe card and the home rail | Tick missing (it was dropped from the detail surface when the sheet was deleted, while surviving on the browse cards — this is the regression the row exists for), or floating at the far right of the row instead of next to the name | ☐ | ☐ |
| G5 | Open an event hosted by a **Mello+** member | The gold crown badge after the name (and after the tick, if they have both) | Badge missing. Note: a card in the *background* of the stack shows the tick but never the crown — that is correct, not a bug. The verified flag rides on the feed row; premium only comes with the full event detail, which only the top card fetches | ☐ | ☐ |
| G6 | Open an event whose host has a very long display name | The name truncates with an ellipsis; the badges and "is hosting" stay on the row | Badges pushed off the right edge, or the row wrapping | ☐ | ☐ |

## H · Restored capability #2 — the wishlist toast, including its failure path

Task 9's review found the save/unsave toast had silently disappeared when
the old sheet was deleted — `useSaveEvent` still rolled back on error, but
nothing surfaced that to the user, reintroducing the exact "the button looks
like it did nothing" bug the original toast's own comment said it fixed. The
three strings were byte-diffed against the deleted sheet by the implementer;
this row is the first time anyone has watched the failure path actually
render.

| # | Step | Expect | Failure looks like | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| H1 | Deal any card, tap the bookmark/save chip on the front face | A small pill reading "Added to wishlist" appears near the bottom, auto-hides after ~1.9s | No toast, wrong text, or it doesn't hide | ☐ | ☐ |
| H2 | Tap the same chip again to unsave | Pill reads "Removed from wishlist" | Wrong text or missing | ☐ | ☐ |
| H3 | **Turn off wifi/data**, then tap the save chip | Pill reads **"Couldn't update wishlist"**, and the save chip's visual state rolls back to what it was before the tap (does not stay stuck in the optimistic "saved" state) | No toast at all (silent failure — the exact regression this restores), or the chip stays showing "saved" despite the write failing | ☐ | ☐ |
| H4 | Turn the network back on, tap save again | Succeeds normally, "Added to wishlist" toast | Leftover broken state from H3 | ☐ | ☐ |
| H5 | From the map (a `'browse'`-sourced deck), swipe right on a card | Same "Added to wishlist" behaviour on the swipe-right save path, not just the bookmark chip | Toast only works from the chip, not from swipe-save | ☐ | ☐ |

## I · The safety queue — reasoning, unit-tested for sequencing, never watched as UI

`safetyQueue.ts`'s sequencing logic (`buildSafetyQueue`/`confirmSafetyQueue`/
`dismissSafetyQueue`) has 6 unit tests confirming the queue only reports
`join: true` once every flag has been confirmed, and that dismissing never
fires a join. That is real coverage of the *logic*. What it cannot cover is
whether `EventDealtCard`'s popup rendering, the "View host profile" secondary
action, and the actual join call are wired to that logic correctly end to
end on screen.

| # | Step | Expect | Failure looks like | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| I1 | As an account that has never seen any of the four safety flags, join an event that trips **more than one** flag (e.g. your first-ever join on a women-only event with a new host) | Popups appear one at a time, in order; the join itself does **not** fire until the last popup is confirmed | Popups skip/overlap, or you're joined after only the first popup | ☐ | ☐ |
| I2 | Partway through a multi-popup queue, dismiss (back button / backdrop) instead of confirming | The whole queue cancels; you are **not** joined; no flags are marked seen for the ones you never confirmed | You end up joined anyway, or a flag you dismissed doesn't reappear next time (marked seen when it shouldn't be) | ☐ | ☐ |
| I3 | Trigger the "new host" popup specifically, tap "View host profile" | Queue clears, card closes entirely, navigates to the host's profile | Navigates but leaves the card/queue open, or does nothing | ☐ | ☐ |
| I4 | Join an event that trips no unseen flags at all | Joins immediately, no popup | A popup appears anyway, or the join silently doesn't happen | ☐ | ☐ |
| I5 | Trip a flag once (confirm it), leave, and join a **different** event that trips the same flag | That flag's popup does **not** reappear — it was marked seen | Popup reappears for a flag you already confirmed | ☐ | ☐ |

## J · The restored Check-in route — reasoning, one path traced, never opened

Task 9's own pre-delete read found that `/events/scan/[eventId]` ("Check in")
had **no other entry point anywhere in the app** — deleting the old sheet
without replacing the button would have orphaned the whole screen with
nothing pointing at it. The button was restored, gated on the same
guest/non-host/not-wrapped condition the old sheet used. Nobody has tapped it
since.

| # | Step | Expect | Failure looks like | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| J1 | Open an event you're an **approved, non-host** participant of, that hasn't been wrapped | "Check in" appears among the back face's secondary actions | Missing, or appears for the host / a non-member | ☐ | ☐ |
| J2 | Tap "Check in" | Navigates to `/events/scan/[eventId]`, the QR-scan screen | Wrong route, crash, or dead tap | ☐ | ☐ |
| J3 | Open the same event as its **host** | "Check in" does **not** appear; "Open chat" does instead, above the pending-requests list if there are any | "Check in" shows for the host too, or "Open chat" missing | ☐ | ☐ |

## K · Restored capability #3 — leave-reason capture

Nearly lost entirely: Task 7's first pass implemented leave as a single
confirm-and-mutate with no reason picker. Review caught it, and the full
two-step flow (`EventBottomSheet.tsx`'s original) was ported into
`useEventCard.ts`/`EventDealtCard.tsx` — `LEAVE_REASONS` and the Mello+ sort
order were byte-diffed against the deleted sheet and confirmed identical.
**The byte-diff verifies the strings, not the wiring.** Whether the picker
actually opens, whether "Something else" reveals the free-text field, and
whether submitting writes a row to `event_leave_feedback` from the new card
is brand-new code with no test coverage — exactly what a device pass exists
to catch.

| # | Step | Expect | Failure looks like | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| K1 | Leave an event you've joined (not hosting) | A confirm dialog appears first ("Stay" / "Yes, leave") | No dialog, or it mutates immediately with no confirm step | ☐ | ☐ |
| K2 | Tap "Yes, leave" | A reason-picker sheet appears with four options: "Can't make it anymore", "My plans changed", "Not comfortable / feels unsafe", "Something else" | Sheet doesn't appear, wrong/missing options, or you're left having already left with no chance to give a reason | ☐ | ☐ |
| K3 | Look at the free-text field | It is present for **every** reason, not just "Something else" — placeholder "Anything the host should know? (optional)", and always optional | The field is missing entirely, or submitting is blocked until it is filled. **This row previously claimed the field appears only for "Something else". That was wrong about both the new card and the sheet it was ported from — `EventDealtCard.tsx` renders the `TextField` unconditionally, and so did `EventBottomSheet.tsx`. The row, not the code, was the bug** | ☐ | ☐ |
| K4 | Type a reason and submit | You are no longer a participant of the event (check the event's roster, or that your primary action reverts to "Join") | You're still listed as a participant, or the app errors/hangs on submit | ☐ | ☐ |
| K5 | If you can query the database: check `event_leave_feedback` for a new row with your reason | A row exists with the reason and any free text you entered | No row, or the reason field is empty/wrong. **If you cannot query the database, tick this only once K1-K4 all completed without error** — note in the row that the write itself was not directly confirmed | ☐ | ☐ |

## L · Restored capability #4 — host approve/reject

Same shape as K: dropped in Task 7's first pass, caught on review, restored
with the rows' Mello+-first sort order confirmed to match the original by
direct read of the sort comparator. Never watched rendering or actually
tapped.

| # | Step | Expect | Failure looks like | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| L1 | As the **host** of an event with at least one pending join request, flip the card to the back | The pending request(s) render as rows (avatar, name, an Approve button, a decline icon button) among the back face's secondary actions | Rows absent entirely — a host would have no way to admit anyone | ☐ | ☐ |
| L2 | With a mix of Mello+ and non-Mello+ pending requesters | Mello+ requesters sort to the top of the list | Order is unsorted / random / non-Mello+ first | ☐ | ☐ |
| L3 | Tap "Approve" on one row | That person becomes a full participant (check the roster on the front or the back face); their row disappears from pending | Nothing happens, an error occurs, or the row stays after approving | ☐ | ☐ |
| L4 | Tap the decline icon on another pending row | That request is removed; the person does not become a participant | Nothing happens, or they get admitted instead of declined | ☐ | ☐ |

## M · Dismiss behaviour and the origin round-trip

M1 used to assert that the pin "fades back in". **No opener has ever hidden its
own element** — the plan never carried design §3's origin-fade requirement
across, and on review it was cut rather than built late (the reasoning is
recorded in the amendment in §3 of the spec: twelve openers, no single home,
and the 80% dim already knocks the origin element to ~20% brightness across the
same 620ms). The row below is corrected to test what is actually built.

| # | Step | Expect | Failure looks like | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| M1 | Deal the **first** card of a fresh deck from a map pin, then drag it down (or tap the dim) without swiping first | Card flies back **to the pin's position** along the reverse of the arc it came in on, accelerating away rather than easing out. The pin itself stays put throughout — it is not hidden and does not need to reappear | Card exits some other way (straight down off-screen), or lands somewhere other than the pin it came from. **Not a failure:** the pin being visible under the dim the whole time — that is the current, deliberate behaviour | ☐ | ☐ |
| M4 | While the card is out, look at the origin element under the dim | It is there, dimmed to roughly a fifth of its normal brightness by the 80% scrim — dark enough not to compete with the card, not hidden | It reads as a distracting second copy of the thing you are looking at. If it does, §3's cut origin-fade is worth revisiting; that is the judgement this row exists to collect | ☐ | ☐ |
| M2 | Deal a deck, swipe through **at least one** card, then dismiss | Card now exits as a **plain downward exit** — no flying back to the original pin | Card still tries to fly back to the (now stale) origin after a swipe | ☐ | ☐ |
| M3 | Drag a card **up** instead of down | Rubber-bands back to centre, no action taken | Card dismisses, flips, or does something on an upward drag | ☐ | ☐ |

## N · Android status bar clearance

`react-native`'s `SafeAreaView` is a no-op on Android — this class of bug is
invisible on iOS by construction, so this row only means something on
Android.

| # | Step | Expect | Failure looks like | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| N1 | Deal a card on Android and check the top of the front face's photo, and the dim itself | Nothing (photo edge, close affordance, top of the stack behind) sits under the status bar | Content tucked under/behind the status bar | ☐ | ☐ |
| N2 | Flip to the back and scroll to the very top | Back face's own top content clears the status bar the same way | Content clipped by the status bar | ☐ | ☐ |

## O · Do the card's own buttons work at all? — reasoning, unresolved, run this first

`DealtCard` puts `Gesture.Exclusive(pan, tap)` on the whole top card, both
faces. Every control on those faces — the front's Join CTA and its save/share
chips, the back's Open chat / Check in / Approve / decline / Leave, and the
the roster rows — is an RN `Pressable` (`Button` and `IconButton` both go
through `PressableScale`, which is one), i.e. the JS responder system, not
RNGH.

When any RNGH gesture activates, RNGH cancels RN's in-flight touches outright:
`RNGestureHandlerManager.mm`'s `didActivateInViewWithTouchHandler:` disables
and re-enables `RCTSurfaceTouchHandler`, which terminates the responder. A Pan
only activates once you move, so it costs presses nothing. **A Tap activates on
every clean tap-up — the same instant a `Pressable` would fire `onPress`.**
Whether the press wins comes down to the order UIKit happens to deliver
`touchesEnded:` in across the two recognisers, which is not specified.

So there are exactly two plausible outcomes and both are wrong:

1. **The button is dead.** The tap wins, the card flips, nothing else happens.
2. **Both fire.** The button acts *and* the card flips underneath the result.

`maxDistance` has been added to the tap so that a drag can never read as a flip
— that is a separate, real fix — but it does not touch this. Nothing here can
be reproduced under Jest (Reanimated 4 throws on import) and none of it has
ever been run. **This is the first interaction any user performs on the
feature.** If it fails, the fix is to make the card's pressables RNGH-aware,
not to shrink the tap: design §5 is "tap the card, anywhere".

| # | Step | Expect | Failure looks like | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| O1 | Deal a card on an event you have not joined and tap the **Join / primary CTA** once | The join (or its safety queue) fires, and the card does **not** flip | Nothing happens and the card flips to the back (outcome 1), or the join fires **and** the card flips (outcome 2). Report which | ☐ | ☐ |
| O2 | Tap the **save (bookmark) chip** top-right of the front face | Saves, "Added to wishlist" toast, no flip | Either failure mode above | ☐ | ☐ |
| O3 | Tap the **share chip** next to it | Share sheet opens, no flip | Either failure mode above | ☐ | ☐ |
| O4 | Flip to the back and tap **Leave event** (as a joined non-host) | The confirm dialog opens and the card stays on its back face | Dialog opens and the card flips to the front underneath it, or the tap only flips | ☐ | ☐ |
| O5 | As a host with a pending request, tap **Approve**, then the decline ✕ on another row | Each acts on that row; the card stays on the back face | Either failure mode above | ☐ | ☐ |
| O7 | Start dragging the card sideways, release **before** the swipe threshold so it springs back | It springs back and stays on the same face | It also flips — meaning `maxDistance` is not doing its job | ☐ | ☐ |

## P · Opening the card from a route above the tabs — reasoning, a fix for a total no-op

`EventDealtCard` used to be mounted inside `app/(tabs)/_layout.tsx`. Three
openers live on routes stacked **above** `(tabs)` in the root `<Stack>` —
`events/wishlist` and `events/swipe` are `presentation: 'modal'`,
`friends/[userId]` is a plain push — as does any push notification tapped while
the user is on a pushed route. All of them dealt the card into a layer behind
the screen that dealt it, and **no card appeared at all**. Silently: no error,
no type failure, nothing a test could see.

The mount has moved to the root layout, and on iOS the card is lifted over
native modal routes by `FullWindowOverlay` — the same mechanism
`InAppNotification` already uses here, and for the same reason (it adds its
container straight onto the key UIWindow, so it clears anything already
presented). On Android no portal is needed: a react-native-screens modal is a
fragment in the same root view, so a sibling of `<Stack>` already covers it.

**Every row here is reasoning.** The mechanism was traced through
`RNSFullWindowOverlay.mm` and `RCTModalHostViewComponentView.mm`; none of it
has been watched. The failure to look for is the blunt one — **no card, at
all** — and the second-order one, that the card appears but its dialogs do not.

> **P5 happened.** The residual risk this section flagged was real, and it was
> reported from the wishlist: Join did nothing, and the app appeared to freeze
> afterwards. UIKit will not present a second modal from a controller that is
> already presenting one, so the pre-join safety popup never opened — and a
> safety queue with no popup to answer leaves `CardPortal` *suspended*, which is
> `opacity: 0` on a still-mounted full-screen layer over everything.
>
> Fixed by making the wishlist do what `search.tsx` and `notifications.tsx`
> already did: deal the card **and dismiss itself**, so the card is never dealt
> over a modal route that stays presented. `EventDealtCard` also clears the
> safety queue on every new deal, so that state can no longer outlive its card.
> P1 and P5 below were rewritten for the new behaviour; **P5a is the freeze.**

| # | Step | Expect | Failure looks like | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| P1 | Open the **wishlist** (`events/wishlist`, a modal route) and tap a saved event | The wishlist dismisses *and* the card deals from that row's rect — one movement, ending with the card over the tabs | No card at all (the original bug); a card under the wishlist; or the wishlist staying put with the card on top of it (the state that broke Join) | ☐ | ☐ |
| P2 | Open the **swipe deck** (`events/swipe`, a modal route) and tap its top card | Card deals from the deck card's rect, over the deck screen | As P1 | ☐ | ☐ |
| P3 | Open a **friend's profile** (`friends/[userId]`, a plain push) and tap one of their events | Card deals from that row, over the profile | As P1 | ☐ | ☐ |
| P4 | With the app open on any **pushed** route (a friend's profile, an event's host screen, a chat), receive a push for an event and tap it | Card deals — bottom-edge arc if the in-app banner has already gone, from the banner's rect if it is still on screen | No card; you are left on the pushed route with nothing having happened | ☐ | ☐ |
| P5 | From the card dealt in **P1**, tap **Join** on an event that should trip a safety popup (your first join, a women-only event, a new host, a party) | The popup appears over the card, and confirming it actually joins — the same as joining from the map | Nothing appears and the action stalls. That is the original bug: it means the card is still being dealt over a presented modal route | ☐ | ☐ |
| P5a | **The freeze.** Do P5, then dismiss whatever you are on and go back to the map | The map pans and taps normally | The map is inert — you can see it but not move it. That is a suspended `CardPortal` still mounted over the app: an invisible full-screen `GestureHandlerRootView`. Check the same on Home and in a chat; if the whole app is unresponsive to drags, this is it, not a map bug | ☐ | ☐ |
| P5b | Join from the wishlist, let the popup appear, then **dismiss the popup** without confirming | You are back on the card, nothing joined, and the app still responds | Anything invisible left over — same failure as P5a | ☐ | ☐ |
| P5c | Deal a card from the wishlist, dismiss it, then deal a *different* card from the map and tap Join | The popup for the *second* event appears. The first card's safety queue must not be sitting there suspending the portal | The second card deals invisibly (portal suspended by a stale queue) | ☐ | ☐ |
| P5d | The same dialog check from a card dealt on the **map** and on a **friend's profile** (neither is a modal route) | Popups and the leave flow work, as before | A regression from the queue-clearing effect | ☐ | ☐ |
| P6 | Dismiss the card dealt in P3 (a plain push — drag down or tap the dim) | The card leaves and you are still on the profile — dismissing the card must not pop the route | The route pops too, or the card leaves and the screen underneath is the wrong one | ☐ | ☐ |
| P6a | Dismiss the card dealt from the **wishlist** in P1 | You are on whatever the wishlist was opened from (the map's deck, or Home) — *not* back in the wishlist, which dismissed itself when the card was dealt | Back in the wishlist, meaning the dismissal did not happen and Join is still broken | ☐ | ☐ |
| P7 | **Android only.** With a card dealt over the wishlist, press the hardware back button | Something sane and consistent — either the card closes or the route pops, but not both, and not a stuck dim with no card | A dim left on screen with nothing on it, or the route popping while the card stays | ☐ | ☐ |
| P8 | From the map (the case that always worked), deal a card and confirm the dim covers the floating tab bar | Tab bar is under the dim and not tappable | Tab bar sits above the dim, or is still tappable — the card is mounted a level higher than it used to be, so this is the row that checks nothing regressed on the path that was fine | ☐ | ☐ |

---

## Not on this sheet, and why

- **The individual step-by-step flip/save/pass mechanics in isolation** —
  covered implicitly by sections A, C, F, M; a standalone "does tapping flip
  the card" row would be unable to fail in any way the sections above don't
  already probe harder.
- **The pin's own coordinate accuracy** (does the map save the right lat/lng)
  — untouched by this branch; that risk belongs to the create flow's device
  sheet (`docs/testing/create-flow-refactor.md` §B), not this one.
- **The "Invite friends" roster nudge** — Task 9 explicitly did not restore
  this (deliberate scope decision, not a gap); nothing to test.

(The leave-reason picker and host approve/reject rows previously listed here
as skipped now have their own sections — K and L — after a review pointed
out that "byte-identical strings" says nothing about whether the newly-built
wiring around them actually works. See the note at the top of each.)

---

## H · The primary button's colour (2026-08-07)

The card's primary action used to be coral for everything that was not gated —
including **Manage event** and **Open chat**, which are navigation to a place you
already own. Every card looked like it was asking for a commitment.

The variant now follows what the action *does* (`primaryVariant`, derived from
`primaryKind` in `useEventCard`), not what the gate is:

| Action | Variant | Why |
| --- | --- | --- |
| Join / Request to join | `primary` (coral) | The one real decision. AGENTS.md's rule for coral. |
| Join with Mello+ | `primary` | Navigation, but still asking you to decide. |
| Manage event / Open chat / Open the wrap | `secondary` | Black on light, **white glass on dark**. |
| Request pending / Event full / Female-only | `tertiary` | Unchanged. |

| # | Do | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| H1 | Deal a card for an event you **host**, in dark mode | "Manage event" is a white glass button with dark text, not coral | ☐ | ☐ |
| H2 | The same in light mode | Black button, white text — unchanged from before | ☐ | ☐ |
| H3 | A card for an event you have **joined** | "Open chat", same treatment as H1/H2 | ☐ | ☐ |
| H4 | A card you have **not** joined | "Join event" is still coral. This is the one that must not have changed | ☐ | ☐ |
| H5 | A card beyond the Mello+ distance gate | "Join with Mello+" is still coral | ☐ | ☐ |
| H6 | A full event, a female-only event, a pending request | Still the muted tertiary, still disabled where it was | ☐ | ☐ |
| H7 | The same six on the **swipe deck's** top card | Identical — both surfaces read the variant from the same hook | ☐ | ☐ |

---

## I · The card back's roster, and who can reach the list (2026-08-07)

Three changes, one section, because the third is only safe because of the
second.

**The face pile replaces the name rows.** For a member the back drew one
full-width row per attendee. On a twelve-person event that pushed the
description, the actions and everything else off the bottom of a card whose
whole job is to be glanceable. Both branches now draw the same overlapping
`AttendeeStack` — the pile every other surface in the app already uses — and
what differs is only what sits under it: **See all attendees** for members, the
join gate for everyone else.

**`isMember` is now a real question.** Both faces read `gate === 'none'` for it.
`'none'` means "nothing is stopping you joining", which is also true of an open
event you have never touched — so **the full roster was showing to strangers**,
against the comment sitting directly above it. It is `isHost || isParticipant`
now, out of `useEventCard`. Rows I5/I6 are the ones that catch this.

**The attendee list has a second kind of viewer.** `/events/attendees/[eventId]`
was written for the host. A plain attendee arriving there got a Requests tab
they cannot use and "Remove from event" in every row's overflow — an option that
exists only to fail against RLS. Both are now behind `isHost`.

| # | Do | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| I1 | Open the back of a card for an event you have **joined**, 3+ attendees | Overlapping face pile, host's face first, then "See all attendees" | ☐ | ☐ |
| I2 | Tap **See all attendees** | The card closes, then the list pushes. Not the list appearing under a card still sitting on top of it | ☐ | ☐ |
| I3 | Back from that list | Lands on whatever the card was dealt over — the map, the feed — not on a re-dealt card | ☐ | ☐ |
| I4 | The back of an event with **12+ attendees** | The section is one pile plus one link. The old failure was the description and actions being pushed off the scroll | ☐ | ☐ |
| I5 | The back of an **open event you have not joined** | Face pile + "Join to see the full list of attendees". **No** See all. This is the leak — it previously showed every name | ☐ | ☐ |
| I6 | Join it, reopen the back | Now See all. The gate flips on join, not on the distance/full/female-only gate | ☐ | ☐ |
| I7 | An event with **no attendees yet** | "Be the first to join", no See all, no empty pile | ☐ | ☐ |
| I8 | As a **host**, See all from the manage panel | Both tabs, Approve/Decline on requests, "Remove from event" in the overflow — all unchanged | ☐ | ☐ |
| I9 | As a plain **attendee**, See all from the card | No tab strip at all, and no band of empty padding where it was | ☐ | ☐ |
| I10 | As a plain attendee, the **⋯** on a row | "Report" and "Cancel" only. No "Remove from event" | ☐ | ☐ |
| I11 | The add-friend glyph on a row there | Works, and reads correctly for someone you already added | ☐ | ☐ |
| I12 | The **swipe deck's** card back | Same pile. No See all even when you are a member — the deck offers nothing that leaves it, by design | ☐ | ☐ |

### Also in this batch

| # | Do | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| I13 | Tap someone's photo in an **event chat** | Their full profile pushes. No summary sheet in between | ☐ | ☐ |
| I14 | The same with the **keyboard open** | Keyboard is gone by the time the profile is up. This is the Android-specific one | ☐ | ☐ |
| I15 | Back from that profile | Returns to the chat, scrolled where you left it | ☐ | ☐ |
| I16 | A **DM** avatar, and a **search** result | Still the summary sheet. Neither was in scope and neither should have moved | ☐ | ☐ |
