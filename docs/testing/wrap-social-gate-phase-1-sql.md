# Phase 1 — SQL to apply and verify

Two of these are the places the plan says a silent wrong answer is possible:
**B2** (the threshold table) and **C1** (the notification count). Do not skip
them.

## Run — 2026-08-08, all green

Run against production over the session pooler with `npm run sql` (see
`scripts/sql.sh`). 074–078 were **already applied**, so only the verification
blocks were executed; the DDL sections below are kept for the record.

| | check | result |
|---|---|---|
| A1 | `wrap_contributions` reads back | `0` rows ✅ |
| B1 | `get_wrap_gate` exists | `TABLE(contributor_count bigint, contributors_needed integer, contributors jsonb, hours_since_end integer)` ✅ |
| B2 | threshold table | all 12 rows match the spec exactly ✅ |
| B3 | non-attendee guard | `not an attendee of this event` — raises, does not leak ✅ |
| B4 | happy path | `0 / 2 / [] / 432` — one row, plausible ✅ |
| C1 | notification count | see below — all four failure modes clear ✅ |
| D | edge function redeploy | **not done** — needs `supabase login` |

C1 was run twice. The first pass picked an event of size 2, where the threshold
is also 2, so the loop never ran *past* the threshold and the once-only flag went
untested. Re-pinned to the largest clean event (size 4, threshold 2):

```
event size = 4  threshold = 2  (loop will run 3 times)
after contributor 1 -> 0 notification(s)  flag=f   [expect 0]  ok
after contributor 2 -> 2 notification(s)  flag=t   [expect 2]  ok
after contributor 3 -> 2 notification(s)  flag=t   [expect 2]  ok
sent to non-contributors = 0   [expect 0]  ok
```

**If you re-run C1, do not paste it into the SQL editor as written.** See the
warning added to C1 below: it sends real push notifications.

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
and matches all 12 rows; this query is what proves Postgres agrees.

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
> meaningless pass.
>
> Since **migration 079** this matters more: `get_wrap_gate` now refuses any
> caller whose `auth.uid()` is not `p_user_id`, so calling it as plain `postgres`
> always raises — B3 would "pass" for the wrong reason. Both blocks below adopt
> the caller's identity first:
>
> ```sql
> SET LOCAL request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
> SET LOCAL ROLE authenticated;
> ```
>
> That is the only way to reproduce what the app actually does.

### B3. The non-attendee guard

Self-selecting — it finds an event the chosen user did **not** attend.

```sql
DROP TABLE IF EXISTS _b3_log;
CREATE TEMP TABLE _b3_log (check_name TEXT, result TEXT, expected TEXT);

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
    INSERT INTO _b3_log VALUES ('setup', 'no non-attended event found', 'skip B3');
    RETURN;
  END IF;

  BEGIN
    PERFORM * FROM get_wrap_gate(v_event, v_user);
    INSERT INTO _b3_log
      VALUES ('non-attendee guard', 'RETURNED ROWS — LEAK', 'an exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _b3_log
      VALUES ('non-attendee guard', SQLERRM, 'not an attendee of this event');
  END;
END $$;

SELECT * FROM _b3_log;
```

**Expected:** one row, `result` = `not an attendee of this event`.
If `result` is `RETURNED ROWS — LEAK`, stop — the function leaks contributor
lists for events the caller never attended.

### B4. The happy path — and that impersonation is refused (079)

```sql
DROP TABLE IF EXISTS _b4_log;
CREATE TEMP TABLE _b4_log (check_name TEXT, result TEXT, expected TEXT);

DO $$
DECLARE v_user UUID; v_event UUID; v_other UUID; r RECORD; msg TEXT;
BEGIN
  SELECT ep.user_id, ep.event_id INTO v_user, v_event
    FROM event_participants ep WHERE ep.status='approved' LIMIT 1;
  SELECT ep.user_id INTO v_other
    FROM event_participants ep
   WHERE ep.event_id = v_event AND ep.user_id <> v_user LIMIT 1;

  -- as yourself: must succeed
  EXECUTE format('SET LOCAL request.jwt.claims = %L',
    json_build_object('sub', v_user, 'role','authenticated')::text);
  SET LOCAL ROLE authenticated;
  SELECT * INTO r FROM get_wrap_gate(v_event, v_user);
  RESET ROLE;
  INSERT INTO _b4_log VALUES ('as self',
    format('have=%s need=%s hrs=%s', r.contributor_count, r.contributors_needed, r.hours_since_end),
    'one row, plausible numbers');

  -- as someone else: must be refused
  BEGIN
    EXECUTE format('SET LOCAL request.jwt.claims = %L',
      json_build_object('sub', v_other, 'role','authenticated')::text);
    SET LOCAL ROLE authenticated;
    PERFORM * FROM get_wrap_gate(v_event, v_user);
    RESET ROLE;
    INSERT INTO _b4_log VALUES ('impersonating another user','ALLOWED — HOLE OPEN','refused');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT; RESET ROLE;
    INSERT INTO _b4_log VALUES ('impersonating another user', msg,
      'get_wrap_gate may only be called for the authenticated user');
  END;
END $$;

SELECT * FROM _b4_log;
```

**Expected:** one row. `contributor_count` 0, `contributors_needed` per the
table above for that event's size, `contributors` `[]`, `hours_since_end` a
plausible number — negative if the event has not ended yet, which is correct
and not a bug.

---

## C. Migration 076 — the unlock notification

Paste `supabase/migrations/076_wrap_unlocked_notification.sql` whole-file.

**Expected:** `ALTER TYPE`, `ALTER TABLE`, `CREATE FUNCTION`, `CREATE TRIGGER`.

If the editor rejects `ALTER TYPE ... ADD VALUE` inside its transaction block,
run that **first line alone**, then the rest of the file.

### C1. ⚠️ The notification count — the other silent-wrong-answer spot

It picks a clean event, adds contributors one at a time, reports the
notification count after each, and deletes everything it made.

> ⚠️ **This block sends real push notifications to real phones.** `notifications`
> carries an `on_notification_push` trigger that calls `push_notification_fanout`,
> which `net.http_post`s to the send-push edge function. The block's own `DELETE`
> at the end removes the notification rows but **not** the already-queued HTTP
> requests — deleting a notification does not unsend a push. Measured on the
> 2026-08-08 run: 2 requests queued.
>
> `net.http_post` is a plain `INSERT INTO net.http_request_queue`, so it is
> transactional. Wrap the block in `BEGIN; … ROLLBACK;` and nothing is sent and
> nothing persists. Note that a rollback also discards a temp-table log, so
> switch the `_c1_log` inserts to `RAISE NOTICE` — psql prints notices as they
> happen, regardless of the outcome of the transaction. That is how the run
> above was done.

```sql
DROP TABLE IF EXISTS _c1_log;
CREATE TEMP TABLE _c1_log (
  seq        INT GENERATED ALWAYS AS IDENTITY,
  check_name TEXT,
  value      TEXT,
  expected   TEXT
);

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
    INSERT INTO _c1_log (check_name, value, expected)
      VALUES ('setup', 'no clean event found', 'an event with 2+ approved attendees');
    RETURN;
  END IF;

  SELECT 1 + (SELECT COUNT(*) FROM event_participants ep
               WHERE ep.event_id = e.id AND ep.status = 'approved'
                 AND ep.user_id <> e.host_id)
    INTO v_size FROM events e WHERE e.id = v_event;

  v_needed := LEAST(v_size, GREATEST(2, LEAST(5, CEIL(v_size / 2.0)::INT)));

  INSERT INTO _c1_log (check_name, value, expected)
    VALUES ('event size', v_size::TEXT, 'informational'),
           ('threshold',  v_needed::TEXT, 'matches the B2 table for this size');

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

    INSERT INTO _c1_log (check_name, value, expected)
      VALUES ('notifications after contributor ' || v_i,
              v_count::TEXT,
              CASE WHEN v_i < v_needed THEN '0' ELSE v_needed::TEXT END);
  END LOOP;

  -- Nobody who did not contribute may have been notified.
  SELECT COUNT(*) INTO v_bad
    FROM notifications n
   WHERE n.event_id = v_event AND n.type = 'wrap_unlocked'
     AND n.recipient_id NOT IN (
       SELECT wc.user_id FROM wrap_contributions wc WHERE wc.event_id = v_event
     );
  INSERT INTO _c1_log (check_name, value, expected)
    VALUES ('sent to non-contributors', v_bad::TEXT, '0');

  -- Leave the database as it was found.
  DELETE FROM notifications WHERE event_id = v_event AND type = 'wrap_unlocked';
  DELETE FROM wrap_contributions WHERE event_id = v_event;
  UPDATE events SET wrap_unlocked_notified = FALSE WHERE id = v_event;

  INSERT INTO _c1_log (check_name, value, expected)
    VALUES ('cleanup', 'done', 'done');
END $$;

SELECT check_name, value, expected,
       CASE
         WHEN expected IN ('informational', 'matches the B2 table for this size')
           THEN '—'
         WHEN value = expected THEN 'ok'
         ELSE 'CHECK THIS'
       END AS status
  FROM _c1_log
 ORDER BY seq;
```

**Expected**, for a threshold of 3 — every `status` reads `ok` or `—`:

| check_name | value | expected |
|---|---|---|
| notifications after contributor 1 | 0 | 0 |
| notifications after contributor 2 | 0 | 0 |
| notifications after contributor 3 | **3** | 3 — fired at the threshold, one per contributor |
| notifications after contributor 4 | 3 | 3 — unchanged, the once-only flag held |
| sent to non-contributors | 0 | 0 |

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
