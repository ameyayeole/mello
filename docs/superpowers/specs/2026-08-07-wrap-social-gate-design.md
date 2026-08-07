# Wrap — social gate, contribution flow and post-event surfaces

**Date:** 2026-08-07
**Status:** approved. Phase 1 planned →
`docs/superpowers/plans/2026-08-07-wrap-social-gate-phase-1.md`.
Phases 2 and 3 not yet planned.

---

## 1. Goal

Turn the wrap from a private checklist into a **group artifact that unlocks when
enough of the group shows up for it**, and give it one deliberate, playful
"here it is" moment when you open the app after the event.

Three things change:

1. The recap unlocks on a **group** threshold, not just your own completion.
2. The four scattered wrap steps become **one contribution flow**.
3. A **dealt card** at app launch becomes the single post-event takeover, and
   the chat's existing auto-opening sheet is retired.

**Tone:** playful and energetic. Lottie character animation is the hero, with
particles supporting and physics kept restrained — motion should not make the
screen tiring to watch a second time.

---

## 2. What already exists (read this before building anything)

The wrap is **not** a greenfield feature. 5,532 lines already ship. A previous
brainstorm on this same topic proposed components that already existed under
different names, and mis-reported all three surfaces as missing. The table below
is the correction.

| Thing | Where | State |
|---|---|---|
| Wrap hub | `app/events/wrap/[eventId].tsx` | ships |
| Wrap sub-screens | `app/events/wrap/{recap,photos,rate,feedback,gallery,superlatives}/[eventId].tsx` | ship |
| Post-event sheet | `src/components/wrap/WrapSheet.tsx` | ships, **auto-opens** from chat |
| Chat banner | `app/(tabs)/chats/[eventId].tsx:725-739` | ships |
| Home entry card | `src/components/wrap/WrapEntryCard.tsx`, rendered `app/(tabs)/index.tsx:572` | ships |
| Swipe rating deck | `app/events/wrap/rate/[eventId].tsx` | ships — pan, velocity fling, stamps, undo, notes |
| Deck state | `src/hooks/useWrapDeck.ts` | ships, optimistic |
| Share to community | `ShareWrapSheet` → `createSharedWrap` → `SharedWrapCard` → `PostCard` | ships end-to-end |
| Dealt-card primitive | `src/components/ui/DealtCard.tsx` + `dealtCardGeometry.ts` | ships |
| Lottie | `lottie-react-native@7.3.4`, `assets/lottie/celebration.json` | ships, used on host + created screens |
| Wrap service | `src/services/wrap.service.ts` (573 lines, 30 exports) | ships |

**Consequences for implementation:**

- The swipe deck the design calls for is **already built**. Do not rebuild it.
  The only missing piece is the thumbs-down reason prompt (§6).
- `DealtCard` already solves deal geometry, per-card origin tilt, flip and stack
  depth. The launch card **composes** it.
- Do not introduce a `WrapCTA` component. `AGENTS.md` fixes the button set at
  three variants; the wrap CTA is `Button variant="primary"`.

---

## 3. What is actually new

1. `wrap_contributions` table + contributor count/list (§4)
2. A server-side `get_wrap_gate` RPC (§4.4) — the client cannot count other
   people's completion
3. The 48-hour clock and the force-unlock path (§4.3)
4. The turn: card flip → **scale-to-fill** entry into the flow (§5.0)
5. The 4:5 photo carousel with an edge peek (§5.1)
6. Superlatives folded into the rating step (§5.2)
7. "Leave a note" moved onto the card; Skip above 15 people (§5.3)
8. Rewind as a **press-and-hold** with role-forked copy (§5.4)
9. Optional thumbs-down reasons, split into two pipelines (§6)
10. The launch dealt card (§7.1)
11. A `thumbsDown` glyph on the `Icon` primitive (§8)

Motion assets are tracked separately in
**`2026-08-07-wrap-lottie-manifest.md`** — two of them (the card reveal and the
rewind hold) are P0. None are blocked; every phase ships without them, just
flatter.

---

## 4. The social gate

### 4.1 What counts as a contributor

A contributor is someone who **finished the whole contribution flow**. Not a
partial step, not a single photo.

```sql
CREATE TABLE wrap_contributions (
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);
```

One row, written when the flow completes. This is deliberate: recomputing four
per-user aggregates to answer "how many people are done" is expensive and drifts
silently. A marker row makes the count a `COUNT(*)` and makes the **contributor
list** — the incentive mechanic — a plain join to `profiles`.

### 4.2 The threshold

`coAttendeeCount` **excludes you** (`wrap.service.ts:78`), so total group size is
`S = coAttendeeCount + 1`.

```
N = min(S, clamp(ceil(S / 2), 2, 5))
```

| S | N | |
|---|---|---|
| 2 | 2 | both |
| 3 | 2 | 2 of 3 |
| 4 | 2 | 2 of 4 |
| 6 | 3 | half |
| 8 | 4 | half |
| 10 | 5 | half |
| 20+ | 5 | capped |

Four properties, each deliberate:

- **`ceil(S/2)`** — "about half showed up for it" reads as a real quorum at the
  6–10 person size Mello actually runs.
- **Floor 2** — one person can never unlock a group artifact alone.
- **Cap 5** — a 40-person event would otherwise never open.
- **`min(S, …)`** — the floor can never demand more people than exist.

### 4.3 Unlocking, and the 48-hour clock

```
unlocked = myStepsDone AND (contributorCount >= N OR hoursSinceEnd > 48)
```

After 48 hours, someone who finished their own steps sees a force-unlock prompt
rather than a dead lock:

> **Only 2 of 5 people contributed.**
> Unlock anyway?

**Why the escape hatch is not optional:** without it, a 3-person event where two
people never reopen the app locks the wrap *permanently* for the one person who
did everything. They would be punished for participating. This is the single
most likely way the feature fails in the wild.

Three clocks, held apart on purpose:

| Clock | Value | Controls | Owned by |
|---|---|---|---|
| **Force-unlock** | 48h | when "unlock anyway" appears | new, this phase |
| Contribution window | **7 days, unchanged** | how long you may contribute | `wrap_window_open()` |
| Home entry card | 7 days | how long the card stays on Home | `getLatestWrappableEvent` |

#### 48h is the unlock clock only — contributing stays open all week

**Decided 2026-08-07 after checking the schema.** `wrap_window_open()`
(`supabase/migrations/032_wrap.sql:31`) gates **seven** RLS policies — photos,
ratings, notes, superlative votes, feedback and both encore policies. Dropping
it to 48 hours would close all seven at once: open the app on day three and you
could not add a photo.

**Do not change `wrap_window_open`.** This phase adds no restriction on
contributing; it only adds a way out of the lock.

The consequence is deliberate and good: because contributing stays open for
seven days, `contributorCount` can still cross `N` on day four and open the wrap
**naturally**. The gate stays live all week, and force-unlock remains the
exception rather than the normal path. Had contribution frozen at 48h, the count
would freeze with it and force-unlock would become the only route for most
events — making the social gate decorative after day two.

At 48h the Home card **flips copy** — "Wrap up last night" → "View wrap" — rather
than disappearing. Urgency is short; the tail for revisiting is long.

`getLatestWrappableEvent` (`wrap.service.ts:534`) already hard-codes a 7-day
window; the 48-hour boundary is a **second** constant, not a replacement.

### 4.4 Why this forces an RPC

`getWrapStatus` (`wrap.service.ts:417`) is eight parallel client-side Supabase
queries with no RPC. Counting other people's completion client-side would require
reading every attendee's ratings, photos and votes — not possible under RLS and
not desirable if it were.

Add `get_wrap_gate(p_event_id, p_user_id)` as `SECURITY DEFINER`, returning
**only what the client cannot derive**:

```
contributor_count   BIGINT   -- cast to Number on the client; BIGINT arrives as a string
contributors_needed INT      -- N, computed server-side
contributors        JSONB    -- [{id, name, photo_url}] for the incentive list
hours_since_end     INT
```

`getWrapStatus` gains a ninth parallel call to this and merges the result, so
there is still one status object and one call site.

`contributors_needed` is computed **server-side** so the threshold cannot drift
between client versions.

**Lean and additive, not a replacement.** An earlier draft of this section
proposed a full `get_wrap_status` RPC subsuming all eight existing client
queries. That was rejected while planning: reproducing eight working queries in
SQL is a refactor smuggled inside a feature, it triples the blast radius, and it
buys no capability the lean version lacks. `AGENTS.md` — don't mix a refactor
with a redesign.

Because it is `SECURITY DEFINER`, the function must **re-assert
`is_event_attendee` itself** — it bypasses RLS, so without that check it would
hand contributor lists to anyone who guessed an event id.

### 4.5 Type change

`WrapStatus` (`src/types/models.ts:346`) gains the four fields above.
`recapUnlocked` at `app/events/wrap/[eventId].tsx:65` changes from
`done >= total` to the expression in §4.3.

---

## 5. The contribution flow

Today the four steps are four routes reached from a checklist. They become **one
flow**, entered from a single **"Wrap it up"** CTA that lives **on the card
itself**, not below it.

```
Turn → Photos → Rate people (swipe + superlatives + notes) → Rewind → Feedback → Done
                                                                    (guests only)   │
                                                                  writes wrap_contributions
```

Every step is **centre-weighted** — the content sits in the middle of the
viewport, not stacked from the top. Walked and approved as an interactive
prototype on 2026-08-07; the prototype source is
`.superpowers/brainstorm/*/content/contribution-flow.html` (gitignored — treat
this section as the record, not that file).

### 5.0 The turn — entering the flow

**"Wrap it up" sits on the card**, on its lower face — not on a button below it.
Tapping it flips the card to its logo face, holds, then scales that face up
until it fills the viewport and *becomes* the flow. One continuous gesture
carries you in: no navigation push, no modal seam.

**The logo face is `MelloPin`** (`src/components/ui/MelloLogo.tsx`, exported
from `@/components/ui`). Decided 2026-08-07: the brand pin *is* the mark, so
there is nothing to wait for. Note the file exports `MelloPin` and
`MelloWordmark` — **there is no component called `MelloLogo`.**

The pin carries the one sanctioned gradient in the app —
`COLORS.primary → COLORS.secondary`, and `MelloLogo.tsx` states the rule
plainly: *"Gradient is reserved for the logo pin only."* Do not extend that
gradient onto the card body; the card is a surface, the pin is the mark.

**Why the CTA is on the card.** A button underneath makes the card an
illustration and the button the thing you press — two objects, one of them
decorative. With the label on its face the card *is* the affordance, so the
thing you touched is the thing that turns, and the animation reads as a
consequence of the tap rather than a cutscene that follows it.

That also means the whole card face is the hit target, not just the label.

- Flip ≈ 650ms, hold ≈ 150ms, scale-to-fill ≈ 550ms; the first step is
  interactive by ~1.5s.
- `DealtCard` already owns the turn and the tilt. **Only the scale-to-fill is
  new.**
- The mark is `MelloPin`, decided rather than deferred — nothing is waiting on
  a logo.

### 5.1 Photos — a fixed-ratio carousel

Five slots, centred, **4:5 only**. The next frame sits just past the screen edge
so the swipe is self-evident without an instruction. Horizontally swipeable;
tapping the centre frame opens the picker.

**Why the ratio is locked.** Every downstream surface — the wrap grid, the
shared-wrap card's `top_photos`, the recap — inherits one shape. Allowing mixed
ratios means every one of those has to letterbox or crop later, and that
decision would be made independently in four places.

The flow will not advance on an empty grid: a wrap with no photos is not worth
unlocking.

### 5.2 Superlatives move into the rating step

Per decision: superlatives are voted **while rating people**, not as a separate
screen. The four categories (`src/constants/superlatives.ts`) are cast against
the same deck of co-attendees you are already swiping through.

### 5.3 The rating deck — note on the card, skip on big events

The deck itself ships (`app/events/wrap/rate/[eventId].tsx`). Two changes:

**The card is the person.** Their profile photo fills the whole card edge to
edge — no avatar sitting on a panel. `RateCard` already builds it this way
(`photoArea: { flex: 1 }`, `photo` at 100%×100%), so this is a statement of what
to preserve, not new work. Name, age and meta sit *on* the photo in `onPhoto`
glass (`rgba(15,24,44,0.46)`, white contents) — the one dark tier, which exists
precisely so text stays legible over a bright photo and a dark one alike.

**"Leave a note" moves onto the card**, along its bottom edge, rather than
living in a header or an action row. A thumb reaching a card reaches its bottom;
the existing `NoteComposer` opens over the deck. On a full-bleed photo this
button is `onPhoto` glass too — never a white chip, which would punch a hole in
the portrait.

**A Skip appears only when the event had more than 15 people.** Below that it
stays hidden.

> **Why gate Skip on size.** The flow is mandatory to unlock the wrap. A
> twenty-person deck standing in front of a gate gets *rushed* — and a rushed
> rating is worse than a skipped one, because it looks like signal. Skipping
> still completes the flow. This is the same reasoning as §6: never make the
> honest path the expensive one.

The exact threshold (15) is a judgement call, not a measurement. It is the point
where the deck stops being a nice review of the night and starts being a chore.

### 5.4 Rewind — press and hold, and it forks by role

"Rewind" is the existing **encore** (`requestEncore` / `withdrawEncore`),
presented as a centred glyph the user must **press and hold** for ~1.2s.

- The ring closes and the screen floods coral under the thumb as the hold
  progresses; releasing early drains it back.
- Haptic on start and on completion.
- **The glyph is Solar's rewind icon, not the iOS ⏪ emoji** — an emoji renders
  as a different picture on Android, which is exactly where this repo's
  invisible bugs live.

**Why a hold rather than a tap.** Rewind is visible to everyone who came (see
below). A hold cannot be done by accident, and the effort is proportionate to a
claim other people will read.

#### Rewind is public, and the count is the point

`encore_requests_select` is `USING (is_event_attendee(event_id, auth.uid()))`
(`supabase/migrations/032_wrap.sql:464`) — **every attendee can already read the
whole table**, `user_id` included. The wrap hub renders the tally today at
`app/events/wrap/[eventId].tsx:206`: *"N people want this again"*.

So the step must **show the live count**, before and after you commit:

- Before: "4 people want to run it back" — this is the social proof that makes
  holding feel worth it.
- After: the count including you, and `encoreCount` is already on `WrapStatus`,
  so no new field is needed.

| Role | Copy after the hold |
|---|---|
| Guest | "You and **4 others** want to run it back. **{host name}** has been told." |
| Host | "Everyone who came will know you want to run it back." |

**Do not describe this step as private anywhere.** An earlier draft of this spec
and the interactive prototype both said "tells {host} privately"; that was wrong
and contradicted by the RLS above. Copy that promises privacy the schema does
not provide is worse than no copy.

**Names are available but not shown.** RLS exposes `user_id`, so a face pile is
possible. The shipping hub shows a count only, and this spec keeps it that way —
a tally invites you to join it, whereas a list of names invites you to work out
who is missing. Revisit only with a reason.

**Rewind is never a gate.** It is a yes/no preference, and you cannot force
someone to say yes. Skipping it still completes the flow.

It is also not answerable in the negative in a durable way today:
`encore_requests` stores only *requests*, so "no" writes nothing and is
indistinguishable from "not asked". Completion is marked by reaching Done, never
by answering this.

### 5.5 Event feedback — last, and guests only

`app/events/wrap/feedback/[eventId].tsx` already ships. It becomes the **final
step before Done**: thumbs up/down on the event itself, plus an optional note.

**Hosts skip it entirely** — they do not rate their own event — so the host's
flow runs Rewind → Done. This matches the existing `isHost ? 3 : 4` split in
`wrapStepTotal`.

**Why last.** It is the only step that judges the *event* rather than the
people or the night's artefacts, and it is the one a guest is least motivated
to complete. Putting it in front of Done means the momentum of four finished
steps carries it, rather than it standing between a guest and the flow they
actually came for.

**Placement decided 2026-08-07** — this step was previously an open question in
the spec, kept by inference. It is now explicit.

### 5.6 Checklist arithmetic

`wrapStepsDone` / `wrapStepTotal` (`src/hooks/useWrap.ts:19-32`) become:

- `total = isHost ? 2 : 3` — photos, rate (incl. superlatives), [event feedback]
- `done` — `myPhotoCount > 0`, plus
  `ratedCount >= coAttendeeCount && votedCategories.length >= 4`, plus
  `feedbackDone` when not host

**These two functions must change together.** Changing one produces no type
error and no test failure — just a checklist that never completes or completes
early.

---

## 6. Thumbs-down reasons

Swipe left commits the rating **immediately**. A dismissible chip row then slides
up:

```
        Anything we should know?
 [ Made me uncomfortable ]  [ No-show ]  [ Not my vibe ]  [ Skip ]
```

**The rating lands whether or not a reason is given**, and the gate never depends
on the reason.

**Why optional rather than required.** The flow is mandatory to unlock the wrap.
If 👎 costs a modal and a required selection while 👍 costs nothing, honesty has
a price, and people racing to unlock will thumb-up everyone. A required reason
would produce cleaner-looking data that is less true — the worst outcome for a
signal we may act on.

**Two pipelines, one chip row.** These are not the same kind of statement and
must not share a destination:

| Chip | Kind | Destination |
|---|---|---|
| Made me uncomfortable | safety | `reports` row |
| No-show | safety | `reports` row |
| Not my vibe | preference | `event_ratings`, no action |

Collecting "this person made me uncomfortable" and routing it nowhere is worse
than never asking. The destination already exists: `reports`
(`supabase/migrations/014_blocks_and_reports.sql:53`) takes
`reporter_id / reported_id / reason / details`, and moderation reads it
out-of-band with the service role. A safety chip writes a `reports` row; a
preference chip does not.

Current copy at `rate/[eventId].tsx:174` — *"Thumbs down stay between you and no
one"* — becomes false once reasons are collected and must be rewritten.

**Later escalation, not now:** require a reason only for a 👎 on someone you have
already rated down at a previous event. Repeat signal, real weight.

---

## 7. Surfaces

### 7.1 App launch — the dealt card (new)

Composes `DealtCard` (`src/components/ui/DealtCard.tsx`). Mounted at root in
`app/_layout.tsx` alongside `EventDealtCard` and `InAppNotification`, which are
root-mounted for the same reason: to clear navigation barriers.

- **Card back:** `MelloPin` from `@/components/ui` — the brand mark, not a
  placeholder (§5.0).
- **Reveal:** Lottie **L1**, playing over the pin. `celebration.json` stands in
  until L1 exists.
- **Trigger:** `useWrapEntry()` returns an event, within 48h of end, not yet dealt.
- **Dismiss:** marks the event seen via **`src/services/seenFlags.ts`** —
  `markFlagSeen('wrapDeal', userId, eventId)` — and **never deals again**.

  That module already solves exactly this: per-user namespacing so switching
  accounts on one phone starts over, SecureStore key sanitising, and a
  fail-open `try/catch` so a keychain error re-shows rather than blocking. An
  earlier draft of this spec invented a `wrapDealt:<eventId>` key; that would
  have been a second implementation of the same format, which is the kind of
  duplication that drifts — one side gets the try/catch and the other does not.
- **CTA:** **"Wrap it up"** on the card's lower face — a
  `Button variant="primary"` laid on the card, not a button beneath it. The
  whole face is the hit target (§5.0).
- **Tap:** turns the card and runs the flow (§5.0), rather than pushing the hub.

The same label is used everywhere the wrap is offered — the chat pin (§7.2) and
the Home card (§7.3) — so one phrase means one thing. Once you have contributed
it becomes **"View wrap"**.

### 7.2 Event chat — permanent pin, no takeover

The banner at `chats/[eventId].tsx:725-739` already ships and stays permanently.
Changes:

- 📸 emoji → `Icon` glyph
- add **"3 of 5 contributed"** plus contributor faces via the existing
  `AttendeeStack`
- **remove the auto-open** at `chats/[eventId].tsx:253-257`

**Why remove it.** Today, entering an ended event's chat force-opens a full
sheet. Adding the launch card would give the same event two takeovers. The dealt
card is the one takeover; the chat keeps a quiet permanent pin. `WrapSheet`
still opens on tap.

### 7.3 Home — the existing banner row, upgraded

`WrapEntryCard` (`src/components/wrap/WrapEntryCard.tsx`, rendered at
`app/(tabs)/index.tsx:572`) stays. It gains the contributor count beside its
progress pill, and past 48 hours its copy flips from **"Wrap it up"** to
**"View wrap"**. It keeps hiding itself once your own checklist is done.

**Decided 2026-08-07.** An earlier draft called for building a second variant —
a horizontal rail of photo cards — and choosing between them on a device. That
was cut without building it, because the question answers itself:

**a rail is a shelf for a plural thing, and the wrap is singular.**
`getLatestWrappableEvent` (`wrap.service.ts:534`) returns **one** event. A
horizontal rail holding one card is strictly a worse row — it costs more
vertical space, competes with "Your plans" for the top of the feed, and buys
nothing. It would only earn its space if people routinely had three or more
unwrapped events at once, and if that were happening the 48-hour urgency would
already have failed.

This also removes the one place this design was going to ship deliberate
duplication against `AGENTS.md`'s anti-fork rule. Nothing now needs to be built
twice and deleted.

### 7.4 The wrap itself — what all of this opens

Everything above is machinery for opening a door. This is what is behind it, and
it had no design until 2026-08-07 — the gate, the flow and the surfaces were all
specified first.

Today that is `app/events/wrap/recap/[eventId].tsx` (307 lines): a title, three
stat cards, superlative winners, a photo strip, one footer button. It is not a
payoff for something you had to earn.

#### The shape falls out of the RLS, not out of taste

"Show everything from the contribution" is impossible, because the flow
deliberately gathers private things. What each one permits:

| Gathered | RLS | On the page |
|---|---|---|
| Photos | attendees | **shared** |
| Superlative votes | anonymous; winner revealed at **3+ votes** (`033:140`) | **shared** — winners only, never voters |
| Rewind | `is_event_attendee` | **shared** — the count |
| Thumbs | `USING (rater_id = auth.uid())` (`032:69`) | **yours** — only *"N people thumbed you up"* |
| Notes | `USING (auth.uid() IN (sender_id, recipient_id))` (`032:125`) | **yours** — only notes written to you |
| Event feedback | `USING (user_id = auth.uid())` (`032:436`) | **neither** — host-only aggregate, elsewhere |

So the wrap is **half shared, half yours**: the same night, a different page per
person. That is a better idea than showing everything and it was not invented —
it is what the schema already permits. Do not try to widen it.

```
   That's a wrap
   Sunrise trek to Skandagiri · Sat 8 Aug

   ── the night ───────────────────────  identical for everyone
   12 photos · 8 people · 34 reactions
   [ photo grid — tap through to the gallery ]
   Superlatives — the four winners
   5 people want to run it back

   ── yours ───────────────────────────  only you see this
   6 people thumbed you up
   2 notes left for you   (sealed — tap to open)
```

`SealedNoteRow` and `useWrapNotes` already exist for the last block.

#### Highlights = comments and reactions on photos

**Comments already ship**: `wrap_photo_comments` with mentions, RLS, composer
and list, wired into the gallery (`gallery/[eventId].tsx:279`). Two changes:

- **Threads.** The table's `PRIMARY KEY (photo_id, user_id)` allows exactly one
  comment per person per photo. Replace it with an `id` so a conversation can
  happen under a photo.
- **Reactions replace the like.** Photos currently have a binary
  `wrap_photo_likes`. Chat already has a full tapback system — `message_reactions`
  (`041`) plus `ReactionBar`, `ReactionPills`, `ReactionOverlay`. Reuse all of
  it, including **the same four emoji**: `ReactionBar`'s `TAPBACKS` is
  `['❤️','👍','👎','😂']`, and its comment explains the count — *"Four, not six.
  More turns a one-glance choice into a menu."* A react should mean the same
  thing in a photo as in a message.

**`like_count` becomes a total reaction count.** It is denormalised on
`event_photos` and it is what orders `top_photos` — which is what a shared wrap
card shows in the Community feed (`get_explore_wraps`, `get_wrap_card`).
Something must still decide which six photos represent the night; keeping the
column and redefining what it counts leaves that working untouched.

---

## 8. Icons

`thumbsUp` exists (`Icon.tsx:249`). **`thumbsDown` does not.** Add it to the
`Icon` primitive as a mirrored path — per `AGENTS.md`, extend the primitive
rather than fork it.

Then replace emoji with glyphs at:
`rate/[eventId].tsx:162,217,223,261,279` and `feedback/[eventId].tsx:92,104`.
The 📸 at `chats/[eventId].tsx:734` goes too.

---

## 9. Out of scope

- **A photo picker for sharing.** Shared wraps keep `top_photos` — the six most
  reacted-to, auto-selected. Manual selection would need chosen IDs stored on
  the post; explicitly deferred.
- Any change to `get_explore_wraps` or the public wrap surface. Phase 4
  redefines what `like_count` *counts* precisely so this stays true.

Reactions and highlights were previously listed here as out of scope for being
"view-time". They now have a home — **§7.4, Phase 4**. Deferring them without a
phase to land in was how they nearly got lost.

---

## 10. What can break silently

Per `AGENTS.md`, these fail with no type error, no lint warning and no test
failure:

1. **`wrapStepsDone` / `wrapStepTotal` drifting apart** (§5.3) — checklist never
   completes, or completes early.
2. **The threshold computed client-side.** It must come from the RPC, or two app
   versions disagree about whether a wrap is unlocked.
3. **Hand-typed query keys.** `useWrap` already uses raw `['wrapEntry', userId]`
   and `['wrapSummary', eventId]` arrays (`useWrap.ts:48,116`) instead of
   `queryKeys`. Contributor-count invalidation must go through
   `src/constants/queryKeys.ts` or the count will stick after someone
   contributes.
4. **The 48h clock computed in two places.** Server and client must not both own
   it — `hoursSinceEnd` comes from the RPC.
5. **`wrap_contributions` written before the flow truly ends** — the gate would
   unlock on partial work.

---

## 11. Decomposition — three plans, not one

This is too large for a single implementation plan. It spans two migrations, an
RPC, a type change, a flow restructure, three surfaces and a new moderation
path. Split it into three phases, each with its own plan and its own device
pass. Each phase leaves the app shippable.

**Phase 1 — the gate.** Migrations 074 (`wrap_contributions`) and 075
(`get_wrap_gate` RPC); `WrapStatus` gains its four fields; `recapUnlocked`
moves to the §4.3 expression; the force-unlock prompt; contributor count and
list surfaced in the existing hub. No new screens. *This phase is the one with
real risk — everything else is UI on top of it.*

**Phase 2 — the contribution flow.** Split in two while planning; it was too
large for one plan and has a genuine ship point in the middle.

- **2a, the shell** *(planned)*: `wrapFlowStore` + one file per step, mirroring
  the create wizard (`AGENTS.md` makes that shape mandatory here); the four
  routes moved in as-is; superlatives folded into the rating step; the
  `thumbsDown` glyph and the end of emoji; `wrapStepsDone`/`wrapStepTotal`
  arithmetic; and **the `wrap_contributions` write**. Until 2a ships nothing
  writes that row, so Phase 1's gate never opens except by force-unlock — 2a is
  what makes Phase 1 useful.
- **2b, the interactions**: the 4:5 photo carousel, "leave a note" moved onto
  the card, Skip above 15 people, thumbs-down reason chips and the `reports`
  split, and the press-and-hold rewind. This is what makes it match the
  approved prototype.

The split is along a real seam: 2a **moves** working screens and changes
structure; 2b **changes behaviour** inside them. Keeping those in one commit
range would mean a regression could not be bisected to either.

**Phase 3 — the surfaces.** The launch dealt card and its seen-flag (via
`seenFlags.ts`, not a new key format); the chat banner upgrade and the removal
of its auto-open; and the Home row's copy, hide rule and destination.

**Phase 4 — the wrap itself.** The "That's a wrap" page (§7.4) with its
shared/yours split; photo reactions replacing the binary like, reusing chat's
tapback components; and comment threads under photos.

Phase 1 must land before 2, 3 and 4 — they all read `contributorCount`. Phases
2, 3 and 4 are independent of each other.

**Build 4 early, not last.** It is the only phase a user actually *sees* as a
reward, and the other three are gates in front of it. Shipping the machinery
first and the payoff last means every device test until then is judging a lock
with nothing behind it.

---

## 12. Verification

- `npm run typecheck` → 0
- `npm test` → green
- `npm run lint` → no new warnings beyond the pre-existing 65
- Migrations **074** (`wrap_contributions` + RLS) and **075**
  (`get_wrap_gate` RPC) applied whole-file in the Supabase SQL editor

There is no component-test coverage — Reanimated 4 throws under Jest — so
**`tsc` passing does not mean the UI is right.** A device test sheet goes in
`docs/testing/`, ordered by risk, covering at minimum:

- gate maths at S = 2, 3, 6, 10, 40 (the clamp boundaries)
- the deadlock case: a 3-person event where nobody else contributes, before and
  after 48h
- the dealt card appearing exactly once, surviving an app restart
- Android specifically — `SafeAreaView` is a no-op there and that whole class of
  bug is invisible on iOS

Threshold arithmetic must be extracted as a pure function so it can be unit
tested without a renderer — the pattern `participationMutations` uses in
`useEventParticipation.ts`.

---

## 13. Open questions

**None.** All three closed on 2026-08-07:

| Question | Resolution |
|---|---|
| Where event feedback sits | Between Rewind and Done, guests only — §5.5 |
| What the launch card's face shows | `MelloPin` — §5.0 |
| Which Home treatment ships | The existing `WrapEntryCard`, upgraded — §7.3 |

The last two were both *"build it and decide later"* items, and both were closed
by argument instead. That is the cheaper answer whenever it is available: a
rail was going to lose to a row because the wrap is singular, and a placeholder
logo was standing in for a mark the app already had. Neither needed a device to
work out.

Nothing here is waiting on an asset. The Lottie assets in the manifest are all
optional — every surface ships without its animation, just flatter.
