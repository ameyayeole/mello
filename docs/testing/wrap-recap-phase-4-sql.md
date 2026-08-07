# Phase 4 — SQL to apply and verify

Run in the Supabase SQL editor, in order, and paste the output back. As with
Phase 1, the build environment has no database access, so none of this has been
observed.

**Apply Phase 1's 074–076 first** if you have not: 077 does not depend on them,
but the app expects all five.

---

## A. Migration 077 — photo reactions

Paste `supabase/migrations/077_photo_reactions.sql` whole-file.

**Expected:** `CREATE TABLE`, 2 indexes, `ALTER TABLE`, 4 policies, `INSERT`,
2 × `CREATE FUNCTION`, 2 × `CREATE TRIGGER`, `UPDATE`. No errors.

Note there are **four** policies, not the three in the plan — select, insert,
**update**, delete. The update one exists because `reactToPhoto` upserts, and
`INSERT … ON CONFLICT DO UPDATE` is checked against the UPDATE policy. Without
it your first reaction saves and changing your mind silently fails.

### A1. ⚠️ Every like became a heart

```sql
SELECT (SELECT COUNT(*) FROM wrap_photo_likes) AS likes,
       (SELECT COUNT(*) FROM photo_reactions)  AS reactions;
```

**Expected:** the two numbers are equal. If `reactions` is lower, the migrating
INSERT hit a conflict it should not have.

### A2. ⚠️ like_count agrees with the rows

```sql
SELECT COUNT(*) AS mismatched
  FROM event_photos p
 WHERE p.like_count <>
       (SELECT COUNT(*) FROM photo_reactions r WHERE r.photo_id = p.id);
```

**Expected: 0.** If it is not, the Community feed's `top_photos` ordering is
already wrong — the shared-wrap cards will show the wrong six photos, and it
will look like a working feed. Stop and fix here.

### A3. The notification trigger replaced the dead one

```sql
SELECT tgname, tgrelid::regclass AS on_table
  FROM pg_trigger
 WHERE tgname IN ('photo_reactions_notify', 'photo_reactions_count',
                  'on_wrap_photo_like')
   AND NOT tgisinternal;
```

**Expected:** three rows. `photo_reactions_notify` and `photo_reactions_count`
on `photo_reactions`; `on_wrap_photo_like` still on `wrap_photo_likes` and now
dormant — nothing writes to that table any more. It is deliberately left in
place so the change is reversible, but it is also the only other thing that
maintains `like_count`, so **do not start writing to `wrap_photo_likes` again**
without dropping it first.

### A4. Reacting notifies, re-reacting does not

Paste this whole block. It picks its own photo and its own actor, so there is
nothing to fill in, and it deletes everything it created before it finishes.

```sql
DROP TABLE IF EXISTS _a4_log;
CREATE TEMP TABLE _a4_log (
  seq        INT GENERATED ALWAYS AS IDENTITY,
  check_name TEXT,
  value      TEXT,
  expected   TEXT
);

DO $$
DECLARE
  v_photo   UUID;
  v_actor   UUID;
  v_started TIMESTAMPTZ := NOW();
  v_before  INT;
  v_insert  INT;
  v_update  INT;
BEGIN
  -- A photo, and an approved attendee of that event who did NOT upload it and
  -- has not already reacted to it.
  SELECT p.id, ep.user_id INTO v_photo, v_actor
    FROM event_photos p
    JOIN event_participants ep
      ON ep.event_id = p.event_id AND ep.status = 'approved'
   WHERE ep.user_id <> p.uploader_id
     AND NOT EXISTS (
       SELECT 1 FROM photo_reactions r
        WHERE r.photo_id = p.id AND r.user_id = ep.user_id
     )
   LIMIT 1;

  IF v_photo IS NULL THEN
    RAISE NOTICE 'No photo/attendee pair available — cannot run A4 yet.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_before FROM notifications
   WHERE type = 'photo_liked' AND sender_id = v_actor;

  INSERT INTO photo_reactions (photo_id, user_id, emoji)
  VALUES (v_photo, v_actor, '👍');

  SELECT COUNT(*) INTO v_insert FROM notifications
   WHERE type = 'photo_liked' AND sender_id = v_actor;

  -- Change of mind. Goes through the same unique index the app's upsert uses.
  UPDATE photo_reactions SET emoji = '😂'
   WHERE photo_id = v_photo AND user_id = v_actor;

  SELECT COUNT(*) INTO v_update FROM notifications
   WHERE type = 'photo_liked' AND sender_id = v_actor;

  RAISE NOTICE 'before=%  after_insert=%  after_update=%', v_before, v_insert, v_update;
  RAISE NOTICE 'PASS if after_insert = before + 1 AND after_update = after_insert';

  -- Leave the table as it was found.
  DELETE FROM photo_reactions WHERE photo_id = v_photo AND user_id = v_actor;
  DELETE FROM notifications
   WHERE type = 'photo_liked' AND sender_id = v_actor AND created_at >= v_started;
END $$;
```

**Expected** in the Messages/Notices pane:
`after_insert = before + 1` and `after_update = after_insert`.

Re-notifying on every change of mind is the failure this catches. If
`after_update` is higher, `photo_reactions_notify` is firing on UPDATE and needs
its `AFTER INSERT` restored.

> **Why a `DO` block rather than plain statements:** in the SQL editor you run as
> `postgres`, so `auth.uid()` is **NULL** — there is no JWT to read a subject
> from. Any check written as `... = auth.uid()` silently matches nothing rather
> than erroring, which is worse than the UUID cast error you would get from a
> leftover `<placeholder>`. This block picks a real `user_id` from the data
> instead. The same applies to B3/B4 in the Phase 1 bundle.
>
> Note it also runs as `postgres`, which **bypasses RLS** — that is fine here
> because this tests the trigger, not the policies. RLS is only truly exercised
> from the app.

---

## B. Migration 078 — comment threads

Count the rows **before** applying, so B1 has something to compare against:

```sql
SELECT COUNT(*) AS before_count FROM wrap_photo_comments;
```

Then paste `supabase/migrations/078_photo_comment_threads.sql` whole-file.

**Expected:** `ALTER TABLE` ×3, `CREATE INDEX`, one policy. No errors.

### B1. ⚠️ Nothing was lost and every row got its own id

```sql
SELECT COUNT(*) AS comments, COUNT(DISTINCT id) AS ids
  FROM wrap_photo_comments;
```

**Expected:** both equal each other **and** equal `before_count`.

If `ids` is less than `comments`, the `gen_random_uuid()` default was applied
once for the whole table instead of per row, and every existing comment shares
an id — the thread UI will key on duplicates and deleting one will appear to
delete several. That would need the column dropped and re-added.

### B2. One person can now comment twice

Self-selecting and self-cleaning, same reason as A4.

```sql
DO $$
DECLARE
  v_photo UUID;
  v_actor UUID;
  v_n     INT;
BEGIN
  SELECT p.id, ep.user_id INTO v_photo, v_actor
    FROM event_photos p
    JOIN event_participants ep
      ON ep.event_id = p.event_id AND ep.status = 'approved'
   LIMIT 1;

  IF v_photo IS NULL THEN
    RAISE NOTICE 'No photo available — skip B2.';
    RETURN;
  END IF;

  INSERT INTO wrap_photo_comments (photo_id, user_id, content)
  VALUES (v_photo, v_actor, '__b2_first'),
         (v_photo, v_actor, '__b2_second');

  SELECT COUNT(*) INTO v_n FROM wrap_photo_comments
   WHERE photo_id = v_photo AND user_id = v_actor
     AND content LIKE '__b2_%';

  RAISE NOTICE 'inserted % of 2 — PASS if 2', v_n;

  DELETE FROM wrap_photo_comments WHERE content LIKE '__b2_%';
END $$;
```

**Expected:** `inserted 2 of 2`. Under the old composite key the second row was
a primary-key violation and the whole block would abort.

---

## C. Redeploy the push edge function

`supabase/functions/send-push-notification/index.ts` changed again in this phase
(`photo_liked` now says "reacted"). If you already redeployed it for Phase 1,
do it once more.

```sh
supabase functions deploy send-push-notification
```
