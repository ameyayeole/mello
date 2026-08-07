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

```sql
-- As a user who is NOT the photo's uploader:
INSERT INTO photo_reactions (photo_id, user_id, emoji)
VALUES ('<a photo you did not upload>', auth.uid(), '👍');

SELECT COUNT(*) FROM notifications
 WHERE type = 'photo_liked' AND sender_id = auth.uid();
-- note the number, then change your mind:

UPDATE photo_reactions SET emoji = '😂'
 WHERE photo_id = '<same photo>' AND user_id = auth.uid();

SELECT COUNT(*) FROM notifications
 WHERE type = 'photo_liked' AND sender_id = auth.uid();
```

**Expected:** the count goes up by exactly 1 on the insert and is **unchanged**
by the update. Re-notifying on every change of mind is the failure here.

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

```sql
INSERT INTO wrap_photo_comments (photo_id, user_id, content)
VALUES ('<a photo>', auth.uid(), 'first'),
       ('<same photo>', auth.uid(), 'second');
```

**Expected:** both insert. Under the old composite key the second was a
violation. Clean up with
`DELETE FROM wrap_photo_comments WHERE content IN ('first','second');`.

---

## C. Redeploy the push edge function

`supabase/functions/send-push-notification/index.ts` changed again in this phase
(`photo_liked` now says "reacted"). If you already redeployed it for Phase 1,
do it once more.

```sh
supabase functions deploy send-push-notification
```
