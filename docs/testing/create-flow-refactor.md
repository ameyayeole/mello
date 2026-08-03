# Create-event flow refactor — device test sheet

Covers the perf pass and split (`main`, merge `52fa40d`) and the submit failure
state (`feat/submit-failure-state`).

Run on **iOS and Android**. Android is not optional here, and not only for the
usual `SafeAreaView` reason: **the pin's screen position is computed from the
live safe-area inset, and that position decides the coordinate the event is
created at.** If the pin sits wrong on Android, events are saved at the wrong
place. That is a data bug wearing a layout bug's clothes, so section B is the
one to run first.

Tick each row on each platform. A row that cannot be run is **BLOCKED**, not
passed — note it and come back.

**What changed, so you know where to look:**

| Area | Change |
| --- | --- |
| `Overlay` (`Sheet` / `Dialog`) | No longer mounts its contents until first opened. Affects **26 callers app-wide**, not just this flow. |
| `CreateEventFlow` | 1,846 lines split into a store plus eleven files. Every step is a new component. |
| Draft state | Moved from 26 `useState` hooks into `createEventStore`. |
| `map.tsx` | Store selectors, memoised flow, event fetching paused during create. |
| Submit | 1,800ms floor for both outcomes; failure now shows a red X instead of an alert. |

**Setup:**

| Need | Why |
| --- | --- |
| An account with a **female** profile | C9 — the female-only toggle is gender-gated |
| A way to kill the network mid-action | Section E |
| A device with a notch **and** one without, if possible | B1, B2 — the anchor is inset-derived |

---

## A · Nothing should have changed

The whole refactor is meant to be invisible. Anything in this section that
differs from before the change is a regression, however small.

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| A1 | Tap Create | Map dims to create mode, "Tap anywhere to drop a pin" appears | ☐ | ☐ |
| A2 | Tap the map | Pin drops and scales in, card slides up from the bottom | ☐ | ☐ |
| A3 | Walk all five steps with Next | Heading changes, progress bar fills, content rises and fades | ☐ | ☐ |
| A4 | Walk back with the back glyph | Step 0 shows a close glyph, not a back arrow | ☐ | ☐ |
| A5 | Watch the card height across all five steps | It never resizes between steps | ☐ | ☐ |

## B · The pin anchor — run this one first

The pin is fixed to a point derived from `insets.top` and the card's measured
height. Whatever coordinate sits under it becomes the event's location.

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| B1 | With the card up, look at the pin | Vertically centred in the gap between the search row and the top of the card | ☐ | ☐ |
| B2 | Pan the map | Pin stays pinned to that point; the map moves under it | ☐ | ☐ |
| B3 | Pan and stop | Address pill under the search bar updates within ~half a second | ☐ | ☐ |
| B4 | Pan to a landmark you can identify, host the event, open it | The saved location is the one that was **under the pin**, not the screen centre | ☐ | ☐ |
| B5 | Search a place from the search bar | Map flies there, pin lands on it | ☐ | ☐ |

**B4 is the important one.** A pin that looks slightly off but saves the wrong
coordinate is the failure mode this section exists for.

## C · The steps

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| C1 | Step 0 — tap through the category pills | Selected pill's black background travels; grid filters | ☐ | ☐ |
| C2 | Step 0 — pick a type | Tile indicator travels to it; the **pin's emoji changes to match** | ☐ | ☐ |
| C3 | Pick a category filter, go to step 1, come back to step 0 | **The filter is still where you left it** — this one is easy to regress | ☐ | ☐ |
| C4 | Step 1 — the title field | Autofocuses; keyboard does not cover the field or the Next button | ☐ | ☐ |
| C5 | Step 1 — type past 60 chars in the title | Stops at 60; counter reads 60/60 | ☐ | ☐ |
| C6 | Step 1 — type ~400 chars of description | Counter appears only past ~400, not before | ☐ | ☐ |
| C7 | Step 2 — the people steppers | Minus disabled at 2, plus disabled at 50 | ☐ | ☐ |
| C8 | Step 2 — tap the number, type `99`, tap away | Clamps to 50 **in view**, not silently | ☐ | ☐ |
| C9 | Step 4 — female-only toggle (female account only) | Confirm modal appears; Back leaves it off, Confirm turns it on | ☐ | ☐ |
| C10 | Step 4 — toggle each switch | Subtitle text under each label updates | ☐ | ☐ |

## D · The pickers — where the sheet bug lived

`Overlay` had three separate bugs here. All three are fixed; all three are
worth re-checking, because two of them were only visible on device.

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| D1 | Step 2 — tap the Starts row | Sheet slides up. **No stagger or pause before it appears** | ☐ | ☐ |
| D2 | Look at the wheels as they open | Both are **already scrolled to the current day and time**, not to the top | ☐ | ☐ |
| D3 | Scroll the day wheel | Ticks once per row; smooth, no stutter on a hard flick | ☐ | ☐ |
| D4 | Scroll the day wheel and watch the time wheel | The time column does **not** jump or redraw | ☐ | ☐ |
| D5 | Close the sheet with Done | Slides down once. **It must not vanish, flash back, and vanish again** | ☐ | ☐ |
| D6 | Close by dragging the grabber down | Same single exit; the scrim lightens as you drag | ☐ | ☐ |
| D7 | Close by tapping the backdrop | Same single exit | ☐ | ☐ |
| D8 | Reopen the Starts sheet | Opens centred on the value you picked | ☐ | ☐ |
| D9 | Set a start time in the past | Red warning appears; Next is disabled | ☐ | ☐ |
| D10 | The Lasts-for sheet | Same checks as D1, D5, D8 | ☐ | ☐ |

## E · Submit — `feat/submit-failure-state`

**This branch has never been run.** The failure path in particular has not been
seen on any device.

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| E1 | Host an event on a good connection | Card slides away, camera zooms in, pin becomes your avatar with a spinning ring, then fills green with a tick | ☐ | ☐ |
| E2 | Time E1 from tap to the green tick | **At least ~1.8s**, even though the write finishes sooner | ☐ | ☐ |
| E3 | Host on a deliberately slow connection | Ring keeps spinning **until the write actually returns** — green must never appear before the row exists | ☐ | ☐ |
| E4 | After the tick | Lands on the "event created" screen; the event appears on the map, in My Events and in Explore | ☐ | ☐ |
| E5 | **Turn off wifi/data, then host** | Full zoom and pin drop play out first, *then* the circle fills **red with an X** | ☐ | ☐ |
| E6 | Read the failure message | "Couldn't create your event. Try again later." under the pin. **No native alert** | ☐ | ☐ |
| E7 | Wait through the failure | After ~2s the camera pulls back and the card returns **with every field still filled in** | ☐ | ☐ |
| E8 | Turn the network back on and press Host again | Succeeds normally; no leftover X, ring spins from the start | ☐ | ☐ |
| E9 | Check the log during E5 | One `host event failed:` warning with the real reason | ☐ | ☐ |

**E5 timing is the specific thing to watch.** The failure used to appear the
instant the write failed, which could be mid-zoom. It should now land at the
same point in the animation that success does.

## F · Drafts

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| F1 | Fill in a type and title, back out, choose **Save for later** | Returns to the map | ☐ | ☐ |
| F2 | Tap Create again | Form comes back filled, with "Picked up where you left off" | ☐ | ☐ |
| F3 | Tap **Start fresh** | Everything blanks; the notice goes; you are back at the drop prompt | ☐ | ☐ |
| F4 | Fill in a draft, back out, choose **Discard** | Returns to the map | ☐ | ☐ |
| F5 | Tap Create again | Blank form, **no** restored notice | ☐ | ☐ |
| F6 | Back out with nothing filled in | Exits immediately with **no** confirm dialog | ☐ | ☐ |
| F7 | Fill a draft, force-quit the app, reopen, tap Create | Draft still there | ☐ | ☐ |
| F8 | Restore a draft that had a pin | Opens straight into the form with the camera on the pin | ☐ | ☐ |
| F9 | Use the map's ✕ (top left) mid-draft | Same save/discard prompt as the card's own close | ☐ | ☐ |

## G · Sheets elsewhere in the app

The `Overlay` change touches **26 callers**. These were reasoned about, not
tested. Each one: does it open, does it close cleanly, is anything typed into
it still there on reopen?

| # | Screen | iOS | Android |
| --- | --- | :-: | :-: |
| G1 | Community — compose post sheet (type something, close, reopen) | ☐ | ☐ |
| G2 | Community — comment sheet | ☐ | ☐ |
| G3 | Community — share post / share wrap sheets | ☐ | ☐ |
| G4 | Chat — option sheet, read-receipt sheet | ☐ | ☐ |
| G5 | Event bottom sheet | ☐ | ☐ |
| G6 | Wrap — note composer, wrap sheet | ☐ | ☐ |
| G7 | Any destructive confirm (block, delete post) | ☐ | ☐ |
| G8 | Map — Hot events sheet | ☐ | ☐ |

For G1 especially: type a draft, dismiss, reopen. **The text should still be
there** — callers hold their state above the `<Sheet>`, which is what makes the
lazy mount safe. If it is gone, that reasoning was wrong.

## H · Optional — the measurement that was never taken

The picker path was **32 `CreateEventFlow` renders per session** before the
split, and was never re-measured afterwards. The claim that the split fixed it
is an argument, not a number.

If you want the number:

```sh
git show 758b381 -- src/hooks/useRenderCount.ts | git apply
```

Then add `useRenderCount('CreateEventFlow')` at the top of the flow component
and `useRenderCount('StepWhen')` in the step, run with `npm run phone`, press
`j` for React Native DevTools, and filter the Console on `[render]`.

Open the Starts sheet, scroll the day wheel, close it. Expect `CreateEventFlow`
to be in low single digits and `StepWhen` to absorb the rest. If
`CreateEventFlow` is still climbing into the twenties, the steps are not
actually isolated and something is subscribing that should not be.

Revert the instrumentation before committing.
