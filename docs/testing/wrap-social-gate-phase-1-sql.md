# Phase 1 — SQL to apply and verify

The agent that wrote Phase 1 had no way to reach the database (no Supabase CLI,
no `psql`, no service-role key or connection string — only the anon key, which
cannot run DDL). This file is the handoff: run each block in the Supabase SQL
editor **in order** and paste the output back.

Two of these are the places the plan says a silent wrong answer is possible:
**B2** (the threshold table) and **C3** (the notification count). Do not skip
them.

---

## A. Migration 074 — the marker table

Paste `supabase/migrations/074_wrap_contributions.sql` whole-file.

**Expected:** `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, two policies. No errors.

### A1. Verify RLS reads back

```sql
-- Run as an attendee of that event. 0 rows is the pass; an ERROR is the fail.
SELECT * FROM wrap_contributions WHERE event_id = '<an event you attended>';
```

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

### B3. The non-attendee guard

```sql
SELECT * FROM get_wrap_gate('<event you did NOT attend>', auth.uid());
```

**Expected:** `ERROR: not an attendee of this event`.
If it returns rows, the guard is broken and contributor lists leak — stop.

### B4. The happy path

```sql
SELECT * FROM get_wrap_gate('<event you DID attend>', auth.uid());
```

**Expected:** one row. `contributor_count` 0, `contributors_needed` per the
table above for that event's size, `contributors` `[]`, `hours_since_end` a
plausible number (negative if it has not ended yet — that is correct).

---

## C. Migration 076 — the unlock notification

Paste `supabase/migrations/076_wrap_unlocked_notification.sql` whole-file.

**Expected:** `ALTER TYPE`, `ALTER TABLE`, `CREATE FUNCTION`, `CREATE TRIGGER`.

If the editor rejects `ALTER TYPE ... ADD VALUE` inside its transaction block,
run that **first line alone**, then the rest of the file.

### C1. Set up a test event

```sql
-- Pick an event and note its size and threshold before inserting anything.
SELECT e.id, e.title,
       1 + (SELECT COUNT(*) FROM event_participants ep
             WHERE ep.event_id = e.id AND ep.status = 'approved'
               AND ep.user_id <> e.host_id) AS size
  FROM events e WHERE e.id = '<test event>';
```

### C2. Insert contributors one at a time

Insert **one row**, then run C3. Repeat. The count must stay 0 until the row
that reaches the threshold.

```sql
INSERT INTO wrap_contributions (event_id, user_id)
VALUES ('<test event>', '<a user who attended>');
```

### C3. ⚠️ The notification count — the other silent-wrong-answer spot

```sql
SELECT type, COUNT(*) FROM notifications
 WHERE event_id = '<test event>' AND type = 'wrap_unlocked'
 GROUP BY type;
```

**Expected sequence** for a 6-person event (threshold 3):

| after inserting contributor # | rows from C3 |
|---|---|
| 1 | 0 (no rows returned at all) |
| 2 | 0 |
| 3 | **3** — one per contributor, fired at the threshold |
| 4 | 3 — unchanged, the once-only flag held |
| 5 | 3 — still unchanged |

Three ways this fails, all silent:
- **Count climbs before the threshold** → the threshold arithmetic in the
  trigger disagrees with 075.
- **Count keeps climbing after** → `wrap_unlocked_notified` is not being set.
- **Non-contributors got one** → the `INSERT ... SELECT` is reading the wrong
  table; only `wrap_contributions` rows should receive.

### C4. Confirm non-contributors got nothing

```sql
SELECT n.recipient_id,
       (n.recipient_id IN (SELECT user_id FROM wrap_contributions
                            WHERE event_id = '<test event>')) AS is_contributor
  FROM notifications n
 WHERE n.event_id = '<test event>' AND n.type = 'wrap_unlocked';
```

**Expected:** every row `is_contributor = true`.

### C5. Clean up the test rows

```sql
DELETE FROM notifications
 WHERE event_id = '<test event>' AND type = 'wrap_unlocked';
DELETE FROM wrap_contributions WHERE event_id = '<test event>';
UPDATE events SET wrap_unlocked_notified = FALSE WHERE id = '<test event>';
```

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
hand with C2 and delete them with C5. Re-run those rows after 2a, since a
hand-inserted row does not prove the flow writes one.
