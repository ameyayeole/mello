# Wrap — social gate, contribution flow and post-event surfaces

**Date:** 2026-08-07
**Status:** design, approved in brainstorm; not yet planned

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
2. A server-side `get_wrap_status` RPC (§4.4) — the client cannot count other
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
rewind hold) are P0 and one is blocked on the logo.

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

| Clock | Value | Controls |
|---|---|---|
| Contribution window | **48h** | urgency to contribute |
| Force-unlock | **after 48h** | the "unlock anyway" prompt |
| Home entry card | **7d** | how long the card stays on Home |

At 48h the Home card **flips copy** — "Wrap up last night" → "View wrap" — rather
than disappearing. Urgency is short; the tail for revisiting is long.

`getLatestWrappableEvent` (`wrap.service.ts:534`) already hard-codes a 7-day
window; the 48-hour boundary is a **second** constant, not a replacement.

### 4.4 Why this forces an RPC

`getWrapStatus` (`wrap.service.ts:417`) is eight parallel client-side Supabase
queries with no RPC. Counting other people's completion client-side would require
reading every attendee's ratings, photos and votes — not possible under RLS and
not desirable if it were.

Add `get_wrap_status(p_event_id, p_user_id)` as `SECURITY DEFINER`, returning the
existing `WrapStatus` fields plus:

```
contributorCount   INT
contributorsNeeded INT      -- N, computed server-side
contributors       JSONB    -- [{id, name, photo_url}] for the incentive list
hoursSinceEnd      INT
```

`contributorsNeeded` is computed **server-side** so the threshold cannot drift
between client versions.

### 4.5 Type change

`WrapStatus` (`src/types/models.ts:346`) gains the four fields above.
`recapUnlocked` at `app/events/wrap/[eventId].tsx:65` changes from
`done >= total` to the expression in §4.3.

---

## 5. The contribution flow

Today the four steps are four routes reached from a checklist. They become **one
flow**, entered from a single "Contribute to the Wrap" CTA.

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

Tapping **Contribute to the Wrap** flips the dealt card to its logo face, holds,
then scales that face up until it fills the viewport and *becomes* the flow.
One continuous gesture carries you in: no navigation push, no modal seam.

- Flip ≈ 650ms, hold ≈ 150ms, scale-to-fill ≈ 550ms; the first step is
  interactive by ~1.5s.
- `DealtCard` already owns the turn and the tilt. **Only the scale-to-fill is
  new.**
- The logo is user-supplied and not yet delivered — `MelloLogo` stands in.

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

**"Leave a note" moves onto the card**, along its bottom edge, rather than
living in a header or an action row. A thumb reaching a card reaches its bottom;
the existing `NoteComposer` opens over the deck.

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

**Why a hold rather than a tap.** Rewind tells other people something about you.
A hold cannot be done by accident, and the effort is proportionate to the claim.

Success copy forks:

| Role | Copy |
|---|---|
| Guest | "We told **{host name}** you want to run it back." |
| Host | "We will let everyone who came know you want to **run it back**." |

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

- **Card back:** the brand logo. **Placeholder until supplied** — use
  `MelloLogo` meanwhile.
- **Reveal:** Lottie character; `assets/lottie/celebration.json` stands in.
- **Trigger:** `useWrapEntry()` returns an event, within 48h of end, not yet dealt.
- **Dismiss:** persists `wrapDealt:<eventId>` to SecureStore and **never deals
  again**. SecureStore is the app's only KV store and `themeStore.ts:26`
  documents that as a deliberate choice — follow that pattern, do not add
  AsyncStorage.
- **Tap:** the wrap hub, with **Contribute to the Wrap** as a
  `Button variant="primary"`.

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

### 7.3 Home — build both, then choose

Deliberately two variants, to be compared on device and one deleted:

- **A:** the existing `WrapEntryCard`, upgraded with contributor progress
- **B:** a horizontal rail reusing `WrapCard` (`src/components/wrap/WrapCard.tsx`)

This is the one place the design intentionally ships duplication. It is
temporary; the losing variant is removed before the branch merges.

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
  liked, auto-selected. Manual selection would need chosen IDs stored on the
  post; explicitly deferred.
- Reactions and emoji on wrap content — those belong to *viewing*, not
  contributing.
- Voting on highlights / favourite moments — also view-time.
- Any change to `get_explore_wraps` or the public wrap surface.

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
(`get_wrap_status` RPC); `WrapStatus` gains its four fields; `recapUnlocked`
moves to the §4.3 expression; the force-unlock prompt; contributor count and
list surfaced in the existing hub. No new screens. *This phase is the one with
real risk — everything else is UI on top of it.*

**Phase 2 — the contribution flow.** Merge superlatives into the rating step;
wire the four routes into one flow ending in a `wrap_contributions` write;
`wrapStepsDone`/`wrapStepTotal` arithmetic; thumbs-down reason chips and the
`reports` split; add the `thumbsDown` glyph and replace the emoji.

**Phase 3 — the surfaces.** The launch dealt card and its SecureStore flag;
chat banner upgrade and auto-open removal; both Home variants, compared on
device, loser deleted.

Phase 1 must land before 2 and 3 — both read `contributorCount`. Phases 2 and 3
are independent of each other.

---

## 12. Verification

- `npm run typecheck` → 0
- `npm test` → green
- `npm run lint` → no new warnings beyond the pre-existing 65
- Migrations **074** (`wrap_contributions` + RLS) and **075**
  (`get_wrap_status` RPC) applied whole-file in the Supabase SQL editor

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

**None blocking.** Event feedback — the last item held open — was resolved on
2026-08-07: it sits between Rewind and Done, guests only. See §5.5.

Two things remain unknown but do not block planning:

- **The logo has not been delivered.** §5.0 and §7.1 both render it; `MelloLogo`
  stands in, and Lottie **L1** is blocked on it (see the Lottie manifest).
- **Which Home treatment survives** (§7.3). Deliberately deferred to a device
  comparison — it cannot be judged in a browser.
