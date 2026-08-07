# Phase 1 — SQL to apply and verify

The agent that wrote Phase 1 had no way to reach the database (no Supabase CLI,
no `psql`, no service-role key or connection string — only the anon key, which
cannot run DDL). This file is the handoff: run each block in the Supabase SQL
editor **in order** and paste the output back.

Two of these are the places the plan says a silent wrong answer is possible:
**B2** (the threshold table) and **C1** (the notification count). Do not skip
them.

---

## A. Migration 074 — the marker table

Paste `supabase/migrations/074_wrap_contributions.sql` whole-file.

**Expected:** `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, two policies. No errors.

### A1. Verify the table reads back

```sql
SELECT COUNT(*) AS rows_so_far FROM wrap_contributions;
```

**Expected:** `0` — and no error. Nothing writes this table until Phase 2a.

Note this does **not** test the RLS policies: as `postgres` you bypass them
entirely. The policies are only genuinely exercised from the app, which is what
the device sheet's section 5 covers.

---

## B. Migration 075 — the gate RPC

Paste `supabase/migrations/075_wrap_gate.sql` whole-file.

**Expected:** `CREATE FUNCTION`, `GRANT`. No errors.

### B1. Does the function exist

```sql
SELECT proname, pg_get_function_result(oid)
  FROM pg_proc WHERE proname = 'get_wrap_gate';
```

### B2. ⚠️ The threshold table — one of the two silent-wrong-answer spots

```sql
SELECT s,
       LEAST(s, GREATEST(2, LEAST(5, CEIL(s / 2.0)::INT)))::INT AS n
  FROM generate_series(2, 12) AS s
UNION ALL
SELECT 40, LEAST(40, GREATEST(2, LEAST(5, CEIL(40 / 2.0)::INT)))::INT;
```

**Expected, exactly** (spec §4.2). The formula was checked arithmetically in JS
and matches all 13 rows; this query is what proves Postgres agrees.

| s | n |   | s | n |
|---|---|---|---|---|
| 2 | 2 |   | 8 | 4 |
| 3 | 2 |   | 9 | 5 |
| 4 | 2 |   | 10 | 5 |
| 5 | 3 |   | 11 | 5 |
| 6 | 3 |   | 12 | 5 |
| 7 | 4 |   | 40 | 5 |

**If any row differs, stop.** Every unlock decision in the app is downstream of
this.

> ⚠️ **`auth.uid()` is NULL in the SQL editor.** You run as `postgres`, not as a
> logged-in user, so there is no JWT to read a subject from. A check written
> `... = auth.uid()` therefore matches **nothing** and reports a cheerful,
> meaningless pass. B3 and B4 below pick a real user id from the data instead.

### B3. The non-attendee guard

Self-selecting — it finds an event the chosen user did **not** attend.

```sql
DO $$
DECLARE
  v_user  UUID;
  v_event UUID;
BEGIN
  SELECT ep.user_id INTO v_user
    FROM event_participants ep WHERE ep.status = 'approved' LIMIT 1;

  SELECT e.id INTO v_event
    FROM events e
   WHERE e.host_id <> v_user
     AND NOT EXISTS (
       SELECT 1 FROM event_participants ep
        WHERE ep.event_id = e.id AND ep.user_id = v_user
          AND ep.status = 'approved'
     )
   LIMIT 1;

  IF v_event IS NULL THEN
    RAISE NOTICE 'No non-attended event available — skip B3.';
    RETURN;
  END IF;

  BEGIN
    PERFORM * FROM get_wrap_gate(v_event, v_user);
    RAISE NOTICE 'FAIL — returned rows for a non-attendee. Contributor lists leak.';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS — guard raised: %', SQLERRM;
  END;
END $$;
```

**Expected:** `PASS — guard raised: not an attendee of this event`.
If it says FAIL, stop — the function leaks contributor lists for events the
caller never attended.

### B4. The happy path

```sql
DO $$
DECLARE
  v_user  UUID;
  v_event UUID;
  r       RECORD;
BEGIN
  SELECT ep.user_id, ep.event_id INTO v_user, v_event
    FROM event_participants ep WHERE ep.status = 'approved' LIMIT 1;

  FOR r IN SELECT * FROM get_wrap_gate(v_event, v_user) LOOP
    RAISE NOTICE 'count=%  needed=%  contributors=%  hours_since_end=%',
      r.contributor_count, r.contributors_needed, r.contributors, r.hours_since_end;
  END LOOP;
END $$;
```

**Expected:** one notice. `count` 0, `needed` per the table above for that
event's size, `contributors` `[]`, `hours_since_end` a plausible number —
negative if the event has not ended yet, which is correct and not a bug.

---

## C. Migration 076 — the unlock notification

Paste `supabase/migrations/076_wrap_unlocked_notification.sql` whole-file.

**Expected:** `ALTER TYPE`, `ALTER TABLE`, `CREATE FUNCTION`, `CREATE TRIGGER`.

If the editor rejects `ALTER TYPE ... ADD VALUE` inside its transaction block,
run that **first line alone**, then the rest of the file.

### C1. ⚠️ The notification count — the other silent-wrong-answer spot

Paste this whole block. It picks a clean event, adds contributors one at a time,
reports the notification count after each, and deletes everything it made.

```sql
DO $$
DECLARE
  v_event   UUID;
  v_size    INT;
  v_needed  INT;
  v_user    UUID;
  v_i       INT := 0;
  v_count   INT;
  v_bad     INT;
BEGIN
  -- An event with 2+ approved attendees that nobody has contributed to yet.
  SELECT e.id INTO v_event
    FROM events e
   WHERE (SELECT COUNT(*) FROM event_participants ep
           WHERE ep.event_id = e.id AND ep.status = 'approved') >= 2
     AND NOT EXISTS (
       SELECT 1 FROM wrap_contributions wc WHERE wc.event_id = e.id
     )
   LIMIT 1;

  IF v_event IS NULL THEN
    RAISE NOTICE 'No clean event with 2+ approved attendees — cannot run C1.';
    RETURN;
  END IF;

  SELECT 1 + (SELECT COUNT(*) FROM event_participants ep
               WHERE ep.event_id = e.id AND ep.status = 'approved'
                 AND ep.user_id <> e.host_id)
    INTO v_size FROM events e WHERE e.id = v_event;

  v_needed := LEAST(v_size, GREATEST(2, LEAST(5, CEIL(v_size / 2.0)::INT)));
  RAISE NOTICE 'event=%  size=%  threshold=%', v_event, v_size, v_needed;

  -- One contributor at a time, one past the threshold to prove it stops.
  FOR v_user IN
    SELECT ep.user_id FROM event_participants ep
     WHERE ep.event_id = v_event AND ep.status = 'approved'
     ORDER BY ep.user_id
     LIMIT v_needed + 1
  LOOP
    v_i := v_i + 1;
    INSERT INTO wrap_contributions (event_id, user_id)
    VALUES (v_event, v_user) ON CONFLICT DO NOTHING;

    SELECT COUNT(*) INTO v_count FROM notifications
     WHERE event_id = v_event AND type = 'wrap_unlocked';

    RAISE NOTICE 'contributor % of % -> % notification(s)  [expect % ]',
      v_i, v_needed, v_count,
      CASE WHEN v_i < v_needed THEN 0 ELSE v_needed END;
  END LOOP;

  -- Nobody who did not contribute may have been notified.
  SELECT COUNT(*) INTO v_bad
    FROM notifications n
   WHERE n.event_id = v_event AND n.type = 'wrap_unlocked'
     AND n.recipient_id NOT IN (
       SELECT wc.user_id FROM wrap_contributions wc WHERE wc.event_id = v_event
     );
  RAISE NOTICE 'notifications sent to non-contributors = %  [expect 0]', v_bad;

  -- Leave the database as it was found.
  DELETE FROM notifications WHERE event_id = v_event AND type = 'wrap_unlocked';
  DELETE FROM wrap_contributions WHERE event_id = v_event;
  UPDATE events SET wrap_unlocked_notified = FALSE WHERE id = v_event;
END $$;
```

**Expected** in the Messages/Notices pane, for a threshold of 3:

| line | count |
|---|---|
| contributor 1 of 3 | 0 |
| contributor 2 of 3 | 0 |
| contributor 3 of 3 | **3** — one per contributor, fired at the threshold |
| contributor 4 of 3 | 3 — unchanged, the once-only flag held |
| non-contributors | **0** |

Four ways this fails, all silent:
- **Count climbs before the threshold** → the trigger's threshold arithmetic
  disagrees with 075.
- **Count keeps climbing after** → `wrap_unlocked_notified` is not being set.
- **Non-contributors got one** → the `INSERT ... SELECT` reads the wrong table.
- **The block errors on the insert** → the notifications column list is wrong;
  the live table is `(recipient_id, sender_id, type, event_id, is_read, payload,
  created_at)`, not `(user_id, actor_id, ...)`.

Note this runs as `postgres`, so RLS — including `wrap_window_open` on the
insert policy — is bypassed. That is deliberate: it lets the trigger be tested
on any event rather than only one inside its 7-day window. The policy itself is
only exercised from the app.

---

## D. Redeploy the push edge function

`supabase/functions/send-push-notification/index.ts` gained the `wrap_unlocked`
case and the rewritten `wrap_ready` body. Until it is redeployed, **remote** push
for these two shows the old/generic copy while in-app banners show the new copy.

```sh
supabase functions deploy send-push-notification
```

---

## E. Unblocking the device sheet

Phase 1 writes no `wrap_contributions` rows — Phase 2a does. To exercise
sections 1–4 of `wrap-social-gate-phase-1.md` before 2a lands, insert rows by
hand — C1's block inserts and then removes them, so copy its INSERT and skip its
cleanup if you want them to persist. Re-run those rows after 2a, since a
hand-inserted row does not prove the flow writes one.
