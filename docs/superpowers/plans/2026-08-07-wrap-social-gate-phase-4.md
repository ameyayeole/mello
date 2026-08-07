# Wrap Phase 4 — the wrap itself

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the thing every other phase is a gate in front of — the
**"That's a wrap"** page, plus emoji reactions and comment threads on its photos.

**Architecture:** The page is half shared and half yours, and that split is not
a design choice — it is what the RLS already permits (spec §7.4). Reactions
reuse chat's tapback system wholesale: `message_reactions`' shape, and
`ReactionBar` / `ReactionPills` / `ReactionOverlay` unchanged. `like_count` is
kept and redefined as a total reaction count so the Community feed's photo
ordering keeps working.

**Tech Stack:** Supabase plpgsql, TanStack Query v5, Reanimated 4, Jest.

## Global Constraints

- Never hardcode a colour, font family or radius — `COLORS` / `FONTS` /
  `RADIUS` / `SPACING` / `TYPE_SIZE`.
- Never hand-type a query key — `src/constants/queryKeys.ts`.
- **Reuse chat's reaction stack, do not fork it.** `src/components/chat/`
  already has `ReactionBar`, `ReactionPills` and `ReactionOverlay`.
- **The same four emoji as chat.** `TAPBACKS = ['❤️','👍','👎','😂']`
  (`ReactionBar.tsx:14`). Its own comment: *"Four, not six. More turns a
  one-glance choice into a menu."* A react must mean the same thing on a photo
  as in a message.
- **Never widen the private half.** Thumbs, notes and event feedback are
  viewer-scoped by RLS. A page that shows "who thumbed whom" is a bug, not a
  feature.
- Emoji in a **reaction picker** is the content, not decoration — the no-emoji
  rule is about UI chrome. Icons stay Solar.

**Depends on Phase 1** (`get_wrap_gate`, `WrapStatus` fields). Independent of
Phases 2 and 3 — **and worth building before them**, since it is the only phase
a user experiences as a reward rather than a gate.

**Verification baseline:** `npm run typecheck` → 0 · `npm test` → green ·
`npm run lint` → 0 errors / 65 warnings pre-existing, do not add.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/077_photo_reactions.sql` | reactions table; `like_count` becomes a reaction count |
| `supabase/migrations/078_photo_comment_threads.sql` | comments get an `id`; many per person |
| `src/types/models.ts` | `PhotoReaction`; `WrapPhoto.myLike` → `myReaction` |
| `src/services/wrap.service.ts` | `reactToPhoto`, `unreactPhoto`; comment CRUD by id |
| `src/hooks/useWrapGallery.ts` | reactions replace the like mutation |
| `src/utils/wrapRecap.ts` | **new** — what the page shows, as a pure function |
| `src/utils/__tests__/wrapRecap.test.ts` | **new** — its tests |
| `app/events/wrap/recap/[eventId].tsx` | the "That's a wrap" page |
| `app/events/wrap/gallery/[eventId].tsx` | reaction bar + threaded comments |
| `src/utils/notificationCopy.ts` | `photo_liked` copy stops saying "liked" |

---

### Task 1: Migration 077 — reactions replace the like

**Files:**
- Create: `supabase/migrations/077_photo_reactions.sql`

**Interfaces:**
- Produces: `photo_reactions(id, photo_id, user_id, emoji, created_at)`;
  `event_photos.like_count` now counts reactions.

Design notes:
- Shaped after `message_reactions` (041), **including the unique index rather
  than a composite primary key** — one reaction per person per photo, tapping a
  second emoji replaces the first.
- `wrap_photo_likes` rows migrate to `❤️` so nothing is lost, then the old table
  is left in place. **Do not drop it in this migration** — an unused table costs
  nothing and dropping it makes the change irreversible without a restore.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- PHOTO REACTIONS. A binary like becomes the same four-emoji tapback the chat
-- already uses (041_message_reactions + ReactionBar's TAPBACKS), so a react
-- means one thing across the app.
--
-- `event_photos.like_count` is KEPT and redefined as a total reaction count.
-- It is what orders `top_photos`, which is what a shared_wrap card shows in the
-- Community feed (033 / 059) — redefining what it counts leaves that working,
-- where removing it would silently empty those cards.
--
-- wrap_photo_likes is migrated across and then left alone. Dropping it would
-- make this irreversible without a restore, and an unused table costs nothing.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS photo_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id   UUID NOT NULL REFERENCES event_photos(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id)     ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One reaction per person per photo; a second emoji replaces the first.
CREATE UNIQUE INDEX IF NOT EXISTS photo_reactions_photo_user_idx
  ON photo_reactions (photo_id, user_id);
CREATE INDEX IF NOT EXISTS photo_reactions_photo_idx
  ON photo_reactions (photo_id);

ALTER TABLE photo_reactions ENABLE ROW LEVEL SECURITY;

-- Visibility follows the photo: if you attended, you can see its reactions.
DROP POLICY IF EXISTS "photo_reactions_select" ON photo_reactions;
CREATE POLICY "photo_reactions_select" ON photo_reactions
  FOR SELECT TO authenticated
  USING (
    photo_id IN (
      SELECT p.id FROM event_photos p
      WHERE is_event_attendee(p.event_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "photo_reactions_write" ON photo_reactions;
CREATE POLICY "photo_reactions_write" ON photo_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND photo_id IN (
      SELECT p.id FROM event_photos p
      WHERE is_event_attendee(p.event_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "photo_reactions_delete" ON photo_reactions;
CREATE POLICY "photo_reactions_delete" ON photo_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Carry existing likes over as hearts.
INSERT INTO photo_reactions (photo_id, user_id, emoji, created_at)
SELECT l.photo_id, l.user_id, '❤️', l.created_at
  FROM wrap_photo_likes l
ON CONFLICT DO NOTHING;

-- like_count now means "reactions".
CREATE OR REPLACE FUNCTION bump_photo_reaction_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE event_photos p
     SET like_count = (
       SELECT COUNT(*) FROM photo_reactions r WHERE r.photo_id = p.id
     )
   WHERE p.id = COALESCE(NEW.photo_id, OLD.photo_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS photo_reactions_count ON photo_reactions;
CREATE TRIGGER photo_reactions_count
  AFTER INSERT OR DELETE OR UPDATE ON photo_reactions
  FOR EACH ROW EXECUTE FUNCTION bump_photo_reaction_count();

-- Backfill so top_photos is correct the moment this lands.
UPDATE event_photos p
   SET like_count = (
     SELECT COUNT(*) FROM photo_reactions r WHERE r.photo_id = p.id
   );
```

- [ ] **Step 2: Apply it** whole-file in the Supabase SQL editor.

- [ ] **Step 3: Verify the backfill and the trigger**

```sql
-- Every existing like became a heart.
SELECT (SELECT COUNT(*) FROM wrap_photo_likes) AS likes,
       (SELECT COUNT(*) FROM photo_reactions)  AS reactions;

-- like_count agrees with the reaction rows.
SELECT COUNT(*) AS mismatched
  FROM event_photos p
 WHERE p.like_count <>
       (SELECT COUNT(*) FROM photo_reactions r WHERE r.photo_id = p.id);
```

Expected: the two counts match, and `mismatched` is **0**. If it is not, the
Community feed's `top_photos` ordering is already wrong — stop and fix here.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/077_photo_reactions.sql
git commit -m "feat(wrap): photo reactions replace the binary like (077)"
```

---

### Task 2: Migration 078 — comments become threads

**Files:**
- Create: `supabase/migrations/078_photo_comment_threads.sql`

**Interfaces:**
- Produces: `wrap_photo_comments` gains `id UUID PRIMARY KEY`; the
  one-per-person constraint is gone.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- PHOTO COMMENT THREADS. wrap_photo_comments was PRIMARY KEY (photo_id,
-- user_id) — exactly one comment per person per photo, so a conversation under
-- a photo was impossible. This swaps the composite key for an id.
--
-- The existing rows keep their content and timestamps; only their identity
-- changes. RLS is unchanged except for a delete policy, which the old shape
-- never needed because an upsert was the only way to edit.
-- Run this whole file in the SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE wrap_photo_comments DROP CONSTRAINT IF EXISTS wrap_photo_comments_pkey;

ALTER TABLE wrap_photo_comments
  ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE wrap_photo_comments ADD PRIMARY KEY (id);

-- The read path: a photo's thread, oldest first.
CREATE INDEX IF NOT EXISTS wrap_photo_comments_photo_idx
  ON wrap_photo_comments (photo_id, created_at);

-- You may remove your own comment. With one-per-person there was nothing to
-- delete — replacing it was the edit.
DROP POLICY IF EXISTS "wrap_photo_comments_delete" ON wrap_photo_comments;
CREATE POLICY "wrap_photo_comments_delete" ON wrap_photo_comments
  FOR DELETE TO authenticated USING (user_id = auth.uid());
```

- [ ] **Step 2: Apply it** whole-file.

- [ ] **Step 3: Verify nothing was lost**

```sql
SELECT COUNT(*) AS comments, COUNT(DISTINCT id) AS ids
  FROM wrap_photo_comments;
```

Expected: the two numbers are equal and match the pre-migration count.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/078_photo_comment_threads.sql
git commit -m "feat(wrap): photo comments become threads (078)"
```

---

### Task 3: Types and service

**Files:**
- Modify: `src/types/models.ts` (`WrapPhoto` :392, `WrapPhotoComment` :383)
- Modify: `src/services/wrap.service.ts`

**Interfaces:**
- Produces:
  - `interface PhotoReaction { id, photo_id, user_id, emoji, created_at }`
  - `WrapPhoto.myReaction?: string | null` (replaces `myLike?: boolean`)
  - `WrapPhoto.reactions?: PhotoReaction[]`
  - `WrapPhotoComment.id: string`
  - `reactToPhoto(photoId, userId, emoji) => Promise<void>`
  - `unreactPhoto(photoId, userId) => Promise<void>`
  - `deletePhotoComment(commentId) => Promise<void>`

- [ ] **Step 1: Add the type** in `models.ts`, above `WrapPhoto`:

```ts
// Same shape as MessageReaction (041) minus the two-target check — a photo
// reaction has exactly one parent.
export interface PhotoReaction {
  id: string;
  photo_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}
```

- [ ] **Step 2: Update `WrapPhoto`.** Replace `myLike?: boolean;` with:

```ts
  reactions?: PhotoReaction[];
  // The emoji I picked, if any. Null rather than false — "which one" replaced
  // "whether", and a boolean here would quietly discard the choice.
  myReaction?: string | null;
```

  Add `id: string;` as the first field of `WrapPhotoComment`.

- [ ] **Step 3: Add the service calls** in `wrap.service.ts`, replacing
      `likePhoto` / `unlikePhoto`:

```ts
// One reaction per person per photo — upsert on the unique index so tapping a
// second emoji replaces the first rather than stacking, the way chat does it.
export async function reactToPhoto(
  photoId: string,
  userId: string,
  emoji: string
): Promise<void> {
  const { error } = await supabase
    .from('photo_reactions')
    .upsert(
      { photo_id: photoId, user_id: userId, emoji },
      { onConflict: 'photo_id,user_id' }
    );
  if (error) throw error;
}

export async function unreactPhoto(
  photoId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('photo_reactions')
    .delete()
    .eq('photo_id', photoId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function deletePhotoComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from('wrap_photo_comments')
    .delete()
    .eq('id', commentId);
  if (error) throw error;
}
```

  Update `commentPhoto` to plain `.insert(...)` — it was an upsert only because
  the composite key made a second comment impossible.

  Update `getWrapPhotos` to select `photo_reactions(*)` alongside `comments`,
  and derive `myReaction` from the viewer's row.

- [ ] **Step 4: Typecheck.** This will surface every `myLike` reader — fix them
      all; that list is the real scope of the change.

Run: `npm run typecheck`
Expected: 0 errors once the gallery is updated in Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/types/models.ts src/services/wrap.service.ts
git commit -m "feat(wrap): photo reactions and threaded comments in the service"
```

---

### Task 4: What the page shows — a pure function

**Files:**
- Create: `src/utils/wrapRecap.ts`
- Test: `src/utils/__tests__/wrapRecap.test.ts`

**Interfaces:**
- Consumes: `WrapSummary`, `WrapStatus`.
- Produces: `recapSections(summary, status) => { shared: {...}, yours: {...} }`

The shared/yours split is the one piece of logic on this page that can be wrong
in a way nobody sees — a leak looks like a working page. So it is a pure
function with tests rather than JSX conditionals.

- [ ] **Step 1: Write the failing test.** Create
      `src/utils/__tests__/wrapRecap.test.ts`:

```ts
import { recapSections } from '../wrapRecap';
import { WrapStatus, WrapSummary } from '@/types/models';

const summary: WrapSummary = {
  attendeeCount: 8,
  photoCount: 12,
  likeCount: 34,
  commentCount: 5,
  messageCount: 120,
  myThumbsReceived: 6,
  superlatives: [
    { category: 'mvp', votes: 4, winner_id: 'u1', winner_name: 'Ana', winner_photo_url: null },
    { category: 'best_vibes', votes: 2, winner_id: null, winner_name: null, winner_photo_url: null },
  ] as never,
};

const status = { encoreCount: 5 } as WrapStatus;

describe('recapSections', () => {
  it('puts photos, people and reactions in the shared half', () => {
    const { shared } = recapSections(summary, status);
    expect(shared.photoCount).toBe(12);
    expect(shared.attendeeCount).toBe(8);
    expect(shared.reactionCount).toBe(34);
  });

  it('carries the encore count into the shared half', () => {
    expect(recapSections(summary, status).shared.encoreCount).toBe(5);
  });

  it('only shows superlatives that reached the reveal threshold', () => {
    const { shared } = recapSections(summary, status);
    expect(shared.superlatives).toHaveLength(1);
    expect(shared.superlatives[0].category).toBe('mvp');
  });

  it('keeps thumbs received in the private half', () => {
    expect(recapSections(summary, status).yours.thumbsReceived).toBe(6);
  });

  it('never puts a per-person thumb figure in the shared half', () => {
    const { shared } = recapSections(summary, status);
    expect(JSON.stringify(shared)).not.toContain('thumbs');
  });

  it('survives a summary with no superlatives at all', () => {
    const bare = { ...summary, superlatives: [] };
    expect(recapSections(bare, status).shared.superlatives).toEqual([]);
  });

  it('treats a missing status as no encores rather than crashing', () => {
    expect(recapSections(summary, undefined).shared.encoreCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/utils/__tests__/wrapRecap.test.ts --forceExit`
Expected: FAIL — `Cannot find module '../wrapRecap'`.

- [ ] **Step 3: Write it.** Create `src/utils/wrapRecap.ts`:

```ts
import { SuperlativeWinner, WrapStatus, WrapSummary } from '@/types/models';

// What the "That's a wrap" page shows, split into the half everyone sees and
// the half only the viewer does.
//
// A pure function rather than conditionals in JSX because the split is the one
// thing here that fails invisibly: a leak renders as a perfectly good-looking
// page. The boundary is not taste — it is what the RLS already permits
// (spec §7.4). Thumbs are readable only by the rater, notes only by sender and
// recipient, event feedback only by its author.
export interface RecapSections {
  shared: {
    photoCount: number;
    attendeeCount: number;
    reactionCount: number;
    messageCount: number;
    superlatives: SuperlativeWinner[];
    encoreCount: number;
  };
  yours: {
    thumbsReceived: number;
  };
}

export function recapSections(
  summary: WrapSummary,
  status: WrapStatus | undefined
): RecapSections {
  return {
    shared: {
      photoCount: summary.photoCount,
      attendeeCount: summary.attendeeCount,
      // `likeCount` counts reactions since migration 077 — the column kept its
      // name so `top_photos` ordering did not have to change.
      reactionCount: summary.likeCount,
      messageCount: summary.messageCount,
      // A winner only exists at 3+ votes (033:140); below that the RPC returns
      // the category with a null winner, which must not render as a blank card.
      superlatives: summary.superlatives.filter((s) => !!s.winner_id),
      encoreCount: status?.encoreCount ?? 0,
    },
    yours: {
      thumbsReceived: summary.myThumbsReceived,
    },
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest src/utils/__tests__/wrapRecap.test.ts --forceExit`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/wrapRecap.ts src/utils/__tests__/wrapRecap.test.ts
git commit -m "feat(wrap): the recap's shared/private split, as a tested rule"
```

---

### Task 5: Reactions and threads in the gallery

**Files:**
- Modify: `app/events/wrap/gallery/[eventId].tsx`
- Modify: `src/hooks/useWrapGallery.ts`

**Interfaces:**
- Consumes: `ReactionBar` (default export, `src/components/chat/ReactionBar.tsx`),
  `ReactionPills`, `reactToPhoto`, `unreactPhoto`, `deletePhotoComment`.

- [ ] **Step 1: Swap the like mutation.** In `useWrapGallery.ts`, replace the
      `like` mutation with `react`:

```ts
  const react = useMutation({
    mutationFn: (args: { photoId: string; emoji: string | null }) =>
      args.emoji
        ? reactToPhoto(args.photoId, user!.id, args.emoji)
        : unreactPhoto(args.photoId, user!.id),
    onSuccess: invalidate,
  });
```

  Keep the optimistic update the like mutation had; a reaction that waits for a
  round trip feels broken.

- [ ] **Step 2: Replace the like button.** In the gallery's photo viewer, swap
      the heart button for `ReactionBar`:

```tsx
              <ReactionBar
                mine={viewer.myReaction ?? undefined}
                onPick={(emoji) =>
                  react.mutate({
                    photoId: viewer.id,
                    // Tapping the emoji you already have takes it back.
                    emoji: viewer.myReaction === emoji ? null : emoji,
                  })
                }
              />
```

  And show the tally with `ReactionPills`. Check its props against
  `src/components/chat/ReactionPills.tsx` — it is typed for `MessageReaction`,
  so either widen that type to a shared shape or pass a mapped array.
  **Widening the type is preferable to a second pills component.**

- [ ] **Step 3: Make the comments a thread.** The composer currently renders
      only when `!myComment` (`gallery/[eventId].tsx:300`). Remove that guard —
      anyone can add to the thread now. Add a delete affordance on your own
      comments via `deletePhotoComment(comment.id)`.

- [ ] **Step 4: Verify** on device: all four emoji work; picking a second
      replaces the first; tapping your own removes it; counts match; two people
      can comment on the same photo; you can delete your own comment and not
      anyone else's.

- [ ] **Step 5: Fix the notification copy that is now wrong.** In
      `src/utils/notificationCopy.ts`, `photo_liked` reads
      *"{sender} liked your photo"*. There are no likes any more:

```ts
    case 'photo_liked':
      return { title: eventTitle, body: `${senderName} reacted to your photo` };
```

  Leave the `photo_liked` **type name** alone — renaming a `notification_type`
  enum value means a migration and a backfill of existing rows, for a string.

- [ ] **Step 6: Check the public wrap still works.** `app/wrap/[eventId].tsx` is
      a **public, read-only** gallery of an event's six most-liked photos, fed by
      `getPublicWrap` and reachable from Explore by people who did not attend.
      It reads the same `like_count` this phase redefined.

  Nothing should need changing — the column kept its name and its ordering
  semantics — but **this is a public surface affected by a migration**, so open
  it and confirm it still shows six sensible photos. It is the one place a
  mistake here is visible to strangers.

- [ ] **Step 7: Typecheck, test, lint, commit**

```bash
npm run typecheck && npm test && npm run lint
git add "app/events/wrap/gallery/[eventId].tsx" src/hooks/useWrapGallery.ts \
        src/components/chat/ReactionPills.tsx src/types/models.ts \
        src/utils/notificationCopy.ts
git commit -m "feat(wrap): react to photos and talk under them"
```

---

### Task 6: The "That's a wrap" page

**Files:**
- Modify: `app/events/wrap/recap/[eventId].tsx`

**Interfaces:**
- Consumes: `recapSections` (Task 4), `useWrapSummary`, `useWrap`,
  `useWrapNotes`, `SealedNoteRow`, `SuperlativeBadge`.

- [ ] **Step 1: Rebuild the page around the split.** Replace the current
      title + three stat cards + strip with:

```
   That's a wrap
   {event.title} · {date}

   ── the night ────────────────────────
   {photoCount} photos · {attendeeCount} people · {reactionCount} reactions
   [ photo grid → gallery ]
   Superlatives — winners only
   {encoreCount} people want to run it back

   ── yours ────────────────────────────
   {thumbsReceived} people thumbed you up
   {notes.length} notes left for you   → SealedNoteRow
```

  Everything above the divider comes from `sections.shared`, everything below
  from `sections.yours` and `useWrapNotes`. **Do not read `summary` directly in
  the JSX** — that is how a private field ends up above the line.

- [ ] **Step 2: Hide an empty private half.** A viewer with no thumbs and no
      notes should not see a "yours" heading over nothing:

```tsx
  const hasYours = sections.yours.thumbsReceived > 0 || notes.length > 0;
```

- [ ] **Step 3: Keep the footer route** to the gallery ("See all photos"), and
      keep `SuperlativeBadge` for the winners — both already exist.

- [ ] **Step 4: Leave the Lottie hook** at the top of the page:

```tsx
        {/* Lottie L5 (wrap unlock) plays here on first open. See
            docs/superpowers/specs/2026-08-07-wrap-lottie-manifest.md. */}
```

- [ ] **Step 5: Verify** on device with **two different accounts on the same
      event** — the shared half must be identical and the private half must
      differ. That comparison is the whole test.

- [ ] **Step 6: Typecheck, test, lint, commit**

```bash
npm run typecheck && npm test && npm run lint
git add "app/events/wrap/recap/[eventId].tsx"
git commit -m "feat(wrap): that's a wrap — the night, and your half of it"
```

---

### Task 7: The device test sheet

**Files:**
- Create: `docs/testing/wrap-recap-phase-4.md`

- [ ] **Step 1: Write the sheet**

```markdown
# The wrap itself (Phase 4) — device sheet

Migrations 077 + 078 applied. ⚠️ rows check reasoning, not an observed bug.

## 1. The private half (highest risk — a leak looks like a working page)
| | iOS | Android |
|---|---|---|
| ⚠️ Two accounts, same event: shared half **identical** | | |
| ⚠️ Two accounts, same event: private half **differs** | | |
| ⚠️ Nobody can see who thumbed whom, anywhere | | |
| ⚠️ Notes shown are only ones written **to** the viewer | | |
| ⚠️ Event feedback appears nowhere on this page | | |
| A viewer with no thumbs and no notes sees no "yours" heading | | |

## 2. Reactions
| | iOS | Android |
|---|---|---|
| All four emoji react | | |
| ⚠️ Picking a second emoji **replaces** the first, never stacks | | |
| Tapping your own emoji removes it | | |
| Counts match the number of people | | |
| ⚠️ Old likes survived as ❤️ | | |
| ⚠️ Community shared-wrap cards still show six photos, ordered sensibly | | |
| ⚠️ The **public** wrap (`app/wrap/[eventId].tsx`, from Explore) still shows six | | |
| ⚠️ A photo-reaction notification says "reacted", not "liked" | | |

## 3. Comment threads
| | iOS | Android |
|---|---|---|
| Two people can comment on the same photo | | |
| One person can comment twice | | |
| ⚠️ Existing pre-migration comments still render | | |
| You can delete your own comment; not anyone else's | | |
| Mentions still highlight | | |

## 4. Superlatives
| | iOS | Android |
|---|---|---|
| ⚠️ A category with fewer than 3 votes renders **nothing**, not a blank card | | |
| Winners show name and avatar | | |

## 5. Android-specific
| | Android |
|---|---|
| ⚠️ ReactionBar usable over a photo on the flat-glass path | |
| ⚠️ Long thread scrolls without trapping the photo pager | |
```

- [ ] **Step 2: Commit**

```bash
git add docs/testing/wrap-recap-phase-4.md
git commit -m "docs(wrap): device sheet for the wrap page"
```

---

## Verification

- `npm run typecheck` → 0
- `npm test` → green (7 new in `wrapRecap.test.ts`; earlier phases still pass)
- `npm run lint` → 0 errors, no new warnings
- Migrations **077** and **078** applied whole-file; both verification queries
  in Tasks 1 and 2 return the expected values
- The two-account comparison in Task 6 Step 5 has actually been done

## What can break silently

1. **`like_count` left un-backfilled.** `top_photos` orders the Community feed's
   shared-wrap cards from it. Wrong values there look like a working feed
   showing the wrong photos. Task 1 Step 3 checks it.
2. **A private field read directly in the recap JSX.** `recapSections` exists so
   the boundary is in one tested place; bypassing it reintroduces the leak with
   no error.
3. **Superlatives with a null winner rendered.** Below 3 votes the RPC still
   returns the category — an unfiltered map produces blank cards.
4. **Reactions stacking instead of replacing.** Only the unique index prevents
   it, and only if the upsert names the right `onConflict`.
5. **A second `ReactionPills` for photos.** Two copies of one component drift;
   widen the type instead.
6. **The public wrap forgotten.** `app/wrap/[eventId].tsx` serves strangers from
   Explore off the same `like_count`. It needs no code change, which is exactly
   why it gets skipped when someone checks their own work.

## Out of scope

A photo picker for sharing to Community — shared wraps keep the auto-selected
`top_photos`. Phases 2 and 3 (the flow, the surfaces).
