# The host's face as the cover — device test sheet

Covers the fix for "an event created without a photo doesn't use the profile
picture". The create flow has never written `user.photo_url` into
`events.image_url` — by design, see the comment in `CreateEventFlow.tsx` — and
`eventImageUri` was meant to resolve the host's face at render instead. It only
worked on rows from the discovery feed RPCs, which are exactly the rows a host
never sees for their own event.

Two independent breaks, both fixed here:

- `eventImageUri` read only the flat `host_photo_url`. `getEventDetail` returns
  the host **nested** (`event.host.photo_url`), so every detail-driven screen —
  the dealt card, the host panel — drew the category glyph.
- `getMyEvents`, `getJoinedEvents` and `searchEvents` never fetched the host's
  photo at all, so "You're hosting", "Also attending", the chats list, the
  profile lists and search had nothing to fall back to.

Six render sites also drew `event.image_url` directly and never called the
helper; they now do. `app/events/edit/[eventId].tsx` deliberately still reads
`image_url` raw — that field is the event's own photo being edited, and showing
the host's face there would make "remove photo" meaningless.

**None of this has been run on a device.** `npm run typecheck` (0 errors),
`npm test` (339 passing) and `npm run lint` (0 errors / 67 warnings — the
pre-existing count) are green, and none of them can see a rendered image. The
one new unit test covers the nested-host shape in `eventImageUri`; everything
below is **reasoning**, traced through the code but never watched.

Run on **iOS and Android**. Tick each row on each platform. A row that cannot
be run is **BLOCKED**, not passed.

Ordered by **risk**, not by feature.

**Setup:**

| Need | Why |
| --- | --- |
| An account with a profile photo set | Every row. Without it there is nothing to fall back to and every row reads as a pass |
| An event you host, created **without** a cover photo | Sections A, B, C, E |
| An event you host **with** a cover photo | Section D (the photo must still win) |
| An event someone else hosts that you have joined, ideally photo-less | Sections B3, C2 |
| A second account with **no** profile photo, hosting a photo-less event | Section F |

---

## A. The path the bug was reported on (highest risk — new query shape)

| # | Step | Expect | iOS | Android |
| --- | --- | --- | --- | --- |
| A1 | Create an event, skip the photo step, publish | The "You're live!" screen — unchanged, it shows the activity emoji badge and never showed a cover | ☐ | ☐ |
| A2 | Tap through to the host panel (`/events/host/[id]`) | Your profile photo fills the cover above the title. **This was blank before.** | ☐ | ☐ |
| A3 | Home → "You're hosting" hero card | Your face as the card image, not the category glyph | ☐ | ☐ |
| A4 | Home → "Your plans" sheet → the hosted row | Your face in the 52pt thumb | ☐ | ☐ |
| A5 | Chats tab → the event's row | Your face in the thumb, and the emoji badge's frosted disc is a blurred copy of it rather than flat ink | ☐ | ☐ |

`getMyEvents` and `getJoinedEvents` changed their PostgREST select to ask for
`photo_url` on the host join. If the join were wrong the whole query would
fail — so a **missing list**, not a missing photo, is the failure mode to watch
for in A3–A5. That is the single riskiest thing in this batch.

## B. The other lists fed by the changed queries

| # | Step | Expect | iOS | Android |
| --- | --- | --- | --- | --- |
| B1 | Profile tab → your hosted events | Host face on the photo-less ones | ☐ | ☐ |
| B2 | Profile tab → featured plan card | Same | ☐ | ☐ |
| B3 | Home → "Also attending" rows for a photo-less event | The **other** host's face, not yours | ☐ | ☐ |
| B4 | Another user's profile (`/friends/[userId]`) → their hosted events | Their face | ☐ | ☐ |
| B5 | Search for a photo-less event by title | Its host's face in the row. `searchEvents` gained a host join *and* now maps through `withParticipantCount` — check the row still renders and the "N going" suffix is absent, not "0 going" | ☐ | ☐ |

## C. Detail-driven screens (the nested-host half of the fix)

| # | Step | Expect | iOS | Android |
| --- | --- | --- | --- | --- |
| C1 | Tap a photo-less event on the map to deal its card | Host face as the card image; the host badge and name row unchanged | ☐ | ☐ |
| C2 | Deal a photo-less event hosted by someone else | Their face, not yours | ☐ | ☐ |
| C3 | Flip the dealt card | Back face unchanged | ☐ | ☐ |

## D. Nothing that already worked changed

| # | Step | Expect | iOS | Android |
| --- | --- | --- | --- | --- |
| D1 | Any event **with** a cover photo, everywhere in A–C | Its own photo, never the host's face — `image_url` still wins | ☐ | ☐ |
| D2 | Wishlist screen | Unchanged for photo'd events; host face for photo-less ones | ☐ | ☐ |
| D3 | Community feed → "Happening in {city}" rail | Same | ☐ | ☐ |
| D4 | Map → swipe deck teaser tiles | Same | ☐ | ☐ |
| D5 | Explore feed / swipe deck cards | Unchanged — these already worked, they read the flat field the RPCs return | ☐ | ☐ |

## E. Edit, which was deliberately left alone

| # | Step | Expect | iOS | Android |
| --- | --- | --- | --- | --- |
| E1 | Edit a photo-less event you host | The photo field is **empty** — it must not preload your face as if the event had a cover | ☐ | ☐ |
| E2 | Add a photo there and save, then revisit the host panel | The new photo replaces your face on every screen in A | ☐ | ☐ |

## F. No face either

| # | Step | Expect | iOS | Android |
| --- | --- | --- | --- | --- |
| F1 | As an account with no profile photo, view your photo-less event across A2–A5 | The category glyph / tile, exactly as before. No broken image frame, no grey box | ☐ | ☐ |

`eventImageUri` uses `||` rather than `??` precisely so an empty-string
`photo_url` from a failed avatar upload falls through to the glyph — F1 is what
proves that end to end.
