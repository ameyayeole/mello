# Manage event redesign — device test sheet

Covers the host panel rebuild on the profile photo-and-sheet structure.
Brief: [`../design/manage-event-redesign.md`](../design/manage-event-redesign.md).
Visual spec: [`../design/manage-event-redesign.html`](../design/manage-event-redesign.html).

Run on **iOS and Android**. Android is not optional: the whole design rests on
`<Glass backdrop>`, which is the one glass surface predicted to render identically on both
platforms — and that prediction has never been checked on a physical Android device. If it
is wrong, the design is wrong, not the implementation.

Tick each row on each platform. A row that cannot be run is **BLOCKED**, not passed — note
it and come back.

**Sections A and E check reasoning rather than something already observed.** Everything
else is confirming that a thing known to work still works. If time is short, run A and E.

**What changed, so you know where to look:**

| Area | Change |
| --- | --- |
| `host/[eventId].tsx` | Rebuilt on `profile.tsx`'s photo window + `<Glass tier="onPhoto">` sheet. Screen-width square hero, parallax, Ken Burns, self-frosting sheet. |
| Section order | hero → pulse strip → action tiles → **requests** → attendees → wishlist. Requests moved from 4th to 3rd. |
| `ParticipantRow` | New `surface?: 'card' \| 'row'` prop. Attendee rows gain add-friend. `#F0F1F3` chips removed. **Affects the attendees screen too** — it keeps `'card'`. |
| `BoostCard` | Collapsed row becomes an action tile. The modal is untouched. |
| Wishlist | Locked state is now a frosted row stack, not a gold-ringed banner. |
| Ended state | Feedback + coral CTA first, chat lift, then a `wrap_notes` carousel. |

**Three decisions were answered differently from the brief's proposal.** Where a
row below assumes the brief's version, this overrides it:

| # | Brief proposed | Shipped |
| --- | --- | --- |
| D1 | Requests collapse to a muted "N requests expired" on an ended event | **The requests section is gone entirely once ended.** Nothing to check for expired rows; check only that the section is absent. |
| D2 | Ship with the chat tile unable to badge | **A per-event unread count was added** (`getEventUnreadCount`, `queryKeys.eventUnread`), refetched on focus. |
| D3 | Chat becomes one of three equal tiles | **Chat keeps a full-width CTA** below two tiles (check-in, boost), with the unread badge on it. |

Also merged: the brief's commits 2 and 3 landed as one, because the screen is a
full rewrite and the intermediate — new chrome with the old order — is not a
state anyone would ship or bisect to. Commits 1, D2 and 6 are separate.

**Setup:**

| Need | Why |
| --- | --- |
| An event you host **with** a cover photo | Most of A and B |
| An event you host with **no** photo | B1, B2 — a different render path |
| A **very bright**, blown-out photo | A4 — the only legibility risk |
| An event with ≥3 pending requests | C1, D2 |
| A **non-premium** host account with wishlist saves | E1 — the one that matters |
| An event past `wrapEndAt`, with received `wrap_notes` | Section C |
| An attendee you are already friends with, one with a pending request, one neither | E2 |

---

## A — The ported structure

The parts that were reasoned about rather than seen.

| # | Check | iOS | Android |
| --- | --- | --- | --- |
| A1 | **The frost tracks the scroll.** Scroll slowly. The sheet's frost must stay pinned to the screen, not slide with the surface. If the reflection moves with the glass, `frostStyle`'s counter-translation is wrong. | | |
| A2 | **`backdrop` renders the same on both.** Compare the two platforms side by side. This is the prediction the whole design rests on. | | |
| A3 | **Pull down past the top.** The photo must grow upward and stay welded to the sheet — no gap at the top, no hairline at the join. Checks `PHOTO_BLEED` and `transformOrigin: 'bottom'` together. | | |
| A4 | **Pull up past the bottom.** More sheet, never bare screen. Checks `SHEET_UNDERHANG` and its cancelling negative margin. | | |
| A5 | **Chips on a blown-out sky.** Back and Edit over a very bright photo. If the back chip is hard to find, the 150pt top fade is too weak. | | |
| A6 | **Ken Burns survives a busy frame.** Scroll hard while it drifts. It runs on the UI thread; it should not stutter with JS. | | |
| A7 | **Nothing sits under the status bar** on Android. `react-native`'s core `SafeAreaView` is a no-op there and the hero now runs to the top edge. | | |

## B — The photo, and not having one

| # | Check | iOS | Android |
| --- | --- | --- | --- |
| B1 | **Photo-less event.** Category tint at 16:9 with the glyph wash. Must read as designed, not as a failed image load. | | |
| B2 | **Photo-less sheet has no edge.** The sheet must be passed a tint `<View>` as its `backdrop`, not `undefined` — otherwise it backdrop-blurs the screen and prints a line where the field stops. | | |
| B3 | **A very long title.** Three lines at `TYPE.display` on the photo. Must not collide with the category pill or push the place line under the sheet lip. | | |
| B4 | **Caption does not scale on pull-down.** Drag down and watch the title. If it grows, the caption was made a child of `photoInner` instead of a sibling. | | |
| B5 | **A portrait photo and a landscape one** in the same square hero. Both must fill without letterboxing. | | |

## C — Ended state

| # | Check | iOS | Android |
| --- | --- | --- | --- |
| C1 | **End to end.** Past `wrapEndAt`: title reads "After the event", eyebrow flips, pulse strip gone, feedback first, boost and wishlist absent, one coral CTA. | | |
| C2 | **Notes carousel.** Zero notes (section absent), one (no pager), several (swipe + pager tracks). Sender's name and avatar on each slide. | | |
| C3 | **`markNoteOpened` fires once per note**, not on every re-render. Check the network tab, then confirm the note is no longer "new" in the wrap. | | |
| C4 | **A note with a photo.** `photo_url` is nullable — the slide height must not jump between a note with one and a note without as you swipe. | | |
| C5 | **Expired requests** (D1, if approved). Ended event with a pending participant: a muted, non-actionable line, never a live Approve. | | |
| C6 | **"Rewind"** reads correctly under the 🔁 and the count still matches `wrapStatus.encoreCount`. | | |

## D — Live state

| # | Check | iOS | Android |
| --- | --- | --- | --- |
| D1 | **Pulse strip counts are right.** Cross-check going / requests / wishlisted against the attendees screen and the wishlist. Requests coral above zero, white at zero. | | |
| D2 | **Approve / decline still invalidates** `eventDetail` and `myEvents`. Fails silently — no error, just a count that stops moving. | | |
| D3 | **Boost tile states.** Zero credits, credits > 0 (dot), actively boosted (solid orange well). The sheet still opens and spends from all three. | | |
| D4 | **Check-in still works** end to end from the tile. | | |
| D5 | **`celebrate=1`.** Straight out of the create flow: congrats lift at the top of the sheet, confetti over everything, tap targets still working through the Lottie layer. | | |
| D6 | **Not-the-host path.** Open a host URL for someone else's event: still the "only the host can manage this" message, no hero, no crash. | | |

## E — The ones with teeth

| # | Check | iOS | Android |
| --- | --- | --- | --- |
| E1 | **The locked wishlist leaks nothing.** Free host, `saversCount > 0`. Inspect the network response **and** the React Query cache: no saver names or ids may be present anywhere. This is the row that stops a paywall becoming a data leak. | | |
| E1b | **Skeleton bones are visible on the sheet, in the _light_ theme.** The `onDark` prop is what makes this pass. Without it they are dark ink on a dark sheet and the locked state looks empty — in one theme only, which is how it ships unnoticed. | | |
| E1c | **Other skeleton callers did not regress.** `onDark` is a new prop on a `ui/` primitive. Load chats, friends, notifications and the post feed — every existing skeleton must look exactly as it did. | | |
| E2 | **Add-friend knows the existing state.** An attendee you are already friends with, one with a pending request, one neither. The glyph must not offer to add all three. | | |
| E3 | **Row hit targets.** Three bare glyphs per attendee row, no chips. Each ≥44pt of touchable area, and a long name truncates rather than shoving them off the row. | | |
| E4 | **The attendees screen did not regress.** It shares `ParticipantRow` and keeps `surface="card"`. Both tabs, approve and decline still work. | | |
| E5 | **Dark mode, everywhere.** Specifically the row glyphs (the `#F0F1F3` fix), the gold crown on `PREMIUM_GOLD_TINT_ON_DARK`, and the sheet — which should look near-identical in both themes, because `onPhoto` barely moves between palettes. | | |

---

## Notes / failures

<!-- Record anything that failed, with device + OS version. A BLOCKED row goes here too. -->

---

## G — The three decisions, as shipped

| # | Check | iOS | Android |
| --- | --- | --- | --- |
| G1 | **D1.** Open an event that has ended and had pending requests. The Requests section must be absent — not empty, not muted, gone. The wishlist section is gone too. | | |
| G2 | **D2.** Have someone send to the event chat, then open this screen. A coral badge on the chat CTA with the count; "9+" past nine. | | |
| G3 | **D2, the refetch.** From this screen, open the chat, read it, come back. The badge must clear — it refetches on focus, which is the only thing that clears it. | | |
| G4 | **D2, your own messages.** Send a message yourself, come back. No badge — you have read what you sent. | | |
| G5 | **D2, never opened.** A host who has never opened the chat sees the full count of everyone else's messages, not zero. | | |
| G6 | **D3.** The live screen: two tiles (check in, boost) above a full-width **Open event chat**. Not three tiles. | | |
| G7 | **D3, ended.** Check-in and boost are gone; the chat CTA remains, under the feedback block. | | |
| G8 | The boost tile when the event **is** boosted: the well goes solid orange with the flame on it. Tapping it still opens the same sheet, with credits and packs untouched. | | |
| G9 | The notes carousel: swipe through every note. Slide height must not change between a note with a photo and one without. | | |
| G10 | A note marked opened: swipe to it once, leave, come back. It should not still read as new in the wrap. | | |
