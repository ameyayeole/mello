# Wrap Social Gate — Phase 1 (the gate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the wrap recap unlock on a **group** threshold instead of your own
checklist — plus a 48-hour escape hatch so a quiet group can never lock the
recap forever.

**Architecture:** A `wrap_contributions` marker row records "this person finished
the flow". A lean `get_wrap_gate` RPC counts those rows, computes the threshold
`N` **server-side**, and returns the contributor list — the client cannot do this
itself under RLS. `getWrapStatus` gains a ninth parallel call to that RPC and
merges the result, so there is one status object and one call site as before.
The unlock rule itself is a pure function, unit tested without a renderer.

**Tech Stack:** Supabase plpgsql, TanStack Query v5, TypeScript, Jest.

## Global Constraints

- **No new screens in this phase.** Phase 1 is data + the existing wrap hub.
- **Never hardcode a colour, font family, or radius** — `COLORS` / `FONTS` /
  `RADIUS` / `SPACING` / `TYPE_SIZE`.
- **Never hand-type a query key.** Use `src/constants/queryKeys.ts`.
- **Do NOT modify `wrap_window_open()`** (`supabase/migrations/032_wrap.sql:31`).
  It gates **seven** RLS policies and stays at 7 days. Contributing remains open
  all week; 48h is only the force-unlock clock. See spec §4.3.
- **The threshold `N` is computed server-side only.** Never reimplement
  `ceil(S/2)` in TypeScript — two app versions would disagree about whether a
  wrap is unlocked.
- Reuse, don't fork: `is_event_attendee` (032), `wrap_end_at` (032),
  `ConfirmDialog`, `Avatar`, `AttendeeStack`, `Icon`.
- Migrations run **whole-file** in the Supabase SQL editor. Do not start a line
  with the `COMMENT` keyword (the editor's splitter breaks on it).

**Deviation from the spec, deliberate:** spec §4.4 proposes replacing
`getWrapStatus` with a full `get_wrap_status` RPC. This plan adds a **lean
additive `get_wrap_gate`** instead. Reproducing eight working client queries in
SQL is a refactor smuggled inside a feature; it triples the blast radius for no
extra capability. The client still cannot count other people's completion, which
was the actual requirement.

**Verification baseline:** `npm run typecheck` → 0 · `npm test` → green ·
`npm run lint` → 0 errors / 65 warnings pre-existing, do not add.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/074_wrap_contributions.sql` | the marker table + its RLS |
| `supabase/migrations/075_wrap_gate.sql` | `get_wrap_gate` RPC — count, threshold, contributors, hours |
| `supabase/migrations/076_wrap_unlocked_notification.sql` | tells contributors the moment it opens |
| `src/utils/notificationCopy.ts` | `wrap_unlocked` copy; `wrap_ready` rewritten |
| `src/types/models.ts` | `WrapStatus` gains four fields; new `WrapContributor` |
| `src/services/wrap.service.ts` | `getWrapGate`, `markWrapContributed`; merged into `getWrapStatus` |
| `src/utils/wrapGate.ts` | **new** — the unlock rule as a pure function |
| `src/utils/__tests__/wrapGate.test.ts` | **new** — its tests |
| `app/events/wrap/[eventId].tsx` | uses the rule; contributor row; force-unlock dialog |

---

### Task 1: Migration 074 — the `wrap_contributions` marker table

**Files:**
- Create: `supabase/migrations/074_wrap_contributions.sql`

**Interfaces:**
- Produces: table `wrap_contributions(event_id, user_id, created_at)` with RLS —
  attendees may read all rows for their event and insert only their own.

Design notes:
- One row per person per event, written when the contribution flow completes
  (Phase 2 writes it; this phase only creates it and reads it).
- Insert is gated on `is_event_attendee` **and** `wrap_window_open` — you may
  only contribute inside the existing 7-day window, matching every other wrap
  table.
- Select is gated on `is_event_attendee` alone, so the contributor list is
  visible to everyone who came. That is intentional: the list is the incentive.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- WRAP CONTRIBUTIONS. One row per person who finished the contribution flow for
-- an event. The wrap's recap unlocks on a count of these rows (see 075), so this
-- is a deliberate marker written once at the end of the flow — not a derived
-- count over ratings/photos/votes, which would be expensive and would drift.
-- Readable by anyone who attended: the contributor list is the incentive to
-- contribute. Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wrap_contributions (
  event_id   UUID NOT NULL REFERENCES events(id)   ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS wrap_contributions_event_idx
  ON wrap_contributions (event_id);

ALTER TABLE wrap_contributions ENABLE ROW LEVEL SECURITY;

-- Everyone who came can see who contributed.
DROP POLICY IF EXISTS "wrap_contributions_select" ON wrap_contributions;
CREATE POLICY "wrap_contributions_select" ON wrap_contributions
  FOR SELECT TO authenticated
  USING (is_event_attendee(event_id, auth.uid()));

-- You may only mark yourself, only if you attended, and only inside the
-- existing 7-day wrap window (wrap_window_open — unchanged by this work).
DROP POLICY IF EXISTS "wrap_contributions_insert" ON wrap_contributions;
CREATE POLICY "wrap_contributions_insert" ON wrap_contributions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND is_event_attendee(event_id, auth.uid())
    AND wrap_window_open(event_id)
  );
```

- [ ] **Step 2: Apply it.** Paste the whole file into the Supabase SQL editor and
      run. Expected: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, two policies,
      no errors.

- [ ] **Step 3: Verify RLS by hand** in the SQL editor:

```sql
-- Should return 0 rows, not an error, when run as an attendee of that event.
SELECT * FROM wrap_contributions WHERE event_id = '<an event you attended>';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/074_wrap_contributions.sql
git commit -m "feat(wrap): wrap_contributions marker table + RLS (074)"
```

---

### Task 2: Migration 075 — the `get_wrap_gate` RPC

**Files:**
- Create: `supabase/migrations/075_wrap_gate.sql`

**Interfaces:**
- Produces: `get_wrap_gate(p_event_id UUID, p_user_id UUID)` returning exactly
  one row:
  `contributor_count BIGINT, contributors_needed INT, contributors JSONB, hours_since_end INT`

Design notes:
- `SECURITY DEFINER`, guarded by an explicit `is_event_attendee` check — the
  function bypasses RLS, so it must re-assert membership itself or it would leak
  contributor lists for events the caller never attended.
- **Event size `S` includes the host**: `1 + approved participants excluding the
  host`. This mirrors how `getCoAttendees` builds its list
  (`wrap.service.ts:37`), where the host is added separately and participants
  matching `host_id` are skipped. Getting this wrong shifts every threshold.
- Threshold: `N = LEAST(S, GREATEST(2, LEAST(5, CEIL(S/2.0))))`. Spec §4.2.
- `hours_since_end` may be negative if the event has not ended; the client only
  compares `> 48`, so no clamping is needed.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- WRAP GATE. Everything the client cannot work out for itself: how many people
-- finished the contribution flow, how many are needed, who they were, and how
-- long ago the event ended. Counting other people's completion is impossible
-- client-side under RLS, which is the whole reason this function exists.
--
-- The threshold lives HERE and only here. If the client also computed it, two
-- app versions could disagree about whether a wrap is unlocked.
--
--   S = everyone at the event, host included
--   N = LEAST(S, GREATEST(2, LEAST(5, CEIL(S/2.0))))
--
-- Floor 2 so one person can never unlock a group artifact alone; cap 5 so a
-- 40-person event is not impossible; LEAST(S, ...) so the floor can never ask
-- for more people than exist. Run this whole file in the SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_wrap_gate(p_event_id UUID, p_user_id UUID)
RETURNS TABLE (
  contributor_count   BIGINT,
  contributors_needed INT,
  contributors        JSONB,
  hours_since_end     INT
) AS $$
DECLARE
  v_size INT;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so membership must be re-asserted here.
  IF NOT is_event_attendee(p_event_id, p_user_id) THEN
    RAISE EXCEPTION 'not an attendee of this event';
  END IF;

  -- Host, plus every approved participant who is not the host.
  SELECT 1 + (
    SELECT COUNT(*) FROM event_participants ep
     WHERE ep.event_id = e.id
       AND ep.status   = 'approved'
       AND ep.user_id <> e.host_id
  )
    INTO v_size
    FROM events e
   WHERE e.id = p_event_id;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM wrap_contributions wc WHERE wc.event_id = p_event_id),
    LEAST(v_size, GREATEST(2, LEAST(5, CEIL(v_size / 2.0)::INT)))::INT,
    COALESCE((
      SELECT jsonb_agg(t ORDER BY t.created_at)
        FROM (
          SELECT pr.id, pr.name, pr.photo_url, wc.created_at
            FROM wrap_contributions wc
            JOIN profiles pr ON pr.id = wc.user_id
           WHERE wc.event_id = p_event_id
        ) t
    ), '[]'::jsonb),
    EXTRACT(EPOCH FROM (NOW() - wrap_end_at(p_event_id)))::INT / 3600;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_wrap_gate(UUID, UUID) TO authenticated;
```

- [ ] **Step 2: Apply it** whole-file in the Supabase SQL editor.
      Expected: `CREATE FUNCTION`, `GRANT`, no errors.

- [ ] **Step 3: Verify the threshold maths against the spec table.** Run this in
      the SQL editor — it exercises the clamp boundaries without needing events:

```sql
SELECT s,
       LEAST(s, GREATEST(2, LEAST(5, CEIL(s / 2.0)::INT)))::INT AS n
  FROM generate_series(2, 12) AS s
UNION ALL
SELECT 40, LEAST(40, GREATEST(2, LEAST(5, CEIL(40 / 2.0)::INT)))::INT;
```

Expected, exactly (spec §4.2):

| s | n |  | s | n |
|---|---|---|---|---|
| 2 | 2 |  | 8 | 4 |
| 3 | 2 |  | 9 | 5 |
| 4 | 2 |  | 10 | 5 |
| 5 | 3 |  | 11 | 5 |
| 6 | 3 |  | 12 | 5 |
| 7 | 4 |  | 40 | 5 |

- [ ] **Step 4: Verify the guard.** Call it for an event you did **not** attend:

```sql
SELECT * FROM get_wrap_gate('<event you did not attend>', auth.uid());
```

Expected: `ERROR: not an attendee of this event`. If it returns rows instead,
the guard is wrong — stop and fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/075_wrap_gate.sql
git commit -m "feat(wrap): get_wrap_gate RPC — contributor count, threshold, list (075)"
```

---

### Task 3: Types and service — fetch the gate and merge it into `WrapStatus`

**Files:**
- Modify: `src/types/models.ts` (`WrapStatus` at :346, new `WrapContributor`)
- Modify: `src/services/wrap.service.ts` (`getWrapGate`; `getWrapStatus` at :417)

**Interfaces:**
- Consumes: `get_wrap_gate` from Task 2.
- Produces:
  - `interface WrapContributor { id: string; name: string; photo_url: string | null }`
  - `WrapStatus` gains `contributorCount: number`, `contributorsNeeded: number`,
    `contributors: WrapContributor[]`, `hoursSinceEnd: number`
  - `getWrapGate(eventId, userId) => Promise<WrapGateRow>` (internal)
  - `getWrapStatus(eventId, userId)` — unchanged signature, four more fields

- [ ] **Step 1: Add the contributor type.** In `src/types/models.ts`, directly
      above `export interface WrapStatus {`:

```ts
// Someone who finished the wrap's contribution flow. Shown on the wrap hub so
// the people who have not yet contributed can see who has.
export interface WrapContributor {
  id: string;
  name: string;
  photo_url: string | null;
}
```

- [ ] **Step 2: Extend `WrapStatus`.** Add these four fields inside the existing
      `WrapStatus` interface (after `encoreCount: number;`):

```ts
  // ── The social gate (get_wrap_gate, migration 075) ────────────────────────
  // How many people finished the whole contribution flow.
  contributorCount: number;
  // How many are required before the recap opens. Computed SERVER-SIDE and
  // never recomputed here — two app versions must not disagree about whether a
  // wrap is unlocked.
  contributorsNeeded: number;
  contributors: WrapContributor[];
  // Negative before the event ends. Only compared against 48 (see wrapGate.ts).
  hoursSinceEnd: number;
```

- [ ] **Step 3: Add the service call.** In `src/services/wrap.service.ts`, add
      immediately above `export async function getWrapStatus(`:

```ts
interface WrapGateRow {
  contributor_count: number;
  contributors_needed: number;
  contributors: WrapContributor[];
  hours_since_end: number;
}

// The part of the wrap's state the client cannot derive: how many other people
// finished the flow, and the threshold. Counting other people's completion is
// impossible client-side under RLS — hence an RPC. The threshold comes back
// from the server rather than being recomputed here on purpose.
async function getWrapGate(
  eventId: string,
  userId: string
): Promise<WrapGateRow> {
  const { data, error } = await supabase.rpc('get_wrap_gate', {
    p_event_id: eventId,
    p_user_id: userId,
  });

  if (error) throw error;
  const rows = (data ?? []) as WrapGateRow[];
  return (
    rows[0] ?? {
      contributor_count: 0,
      contributors_needed: 2,
      contributors: [],
      hours_since_end: 0,
    }
  );
}
```

  Add `WrapContributor` to the existing `@/types/models` import in this file.

- [ ] **Step 4: Fetch it alongside the other eight.** In `getWrapStatus`, add
      `getWrapGate(eventId, userId),` as the **last** entry of the
      `Promise.all([...])` array, and `gate,` as the **last** name in the
      destructuring array — order matters, they are positional.

- [ ] **Step 5: Merge it into the returned object.** Add to the `return { ... }`
      of `getWrapStatus`, after `encoreCount`:

```ts
    contributorCount: Number(gate.contributor_count ?? 0),
    contributorsNeeded: gate.contributors_needed ?? 2,
    contributors: gate.contributors ?? [],
    hoursSinceEnd: gate.hours_since_end ?? 0,
```

  `contributor_count` arrives as a `BIGINT`, which PostgREST serialises as a
  string — `Number(...)` is required, not cosmetic.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/types/models.ts src/services/wrap.service.ts
git commit -m "feat(wrap): WrapStatus carries the gate — count, threshold, contributors"
```

---

### Task 4: The unlock rule as a pure, tested function

**Files:**
- Create: `src/utils/wrapGate.ts`
- Test: `src/utils/__tests__/wrapGate.test.ts`

**Interfaces:**
- Consumes: `WrapStatus` (Task 3), `wrapStepsDone` / `wrapStepTotal`
  (`src/hooks/useWrap.ts:19-32`).
- Produces:
  - `type WrapGateState = 'locked' | 'unlockable' | 'open'`
  - `wrapGateState(status: WrapStatus | undefined): WrapGateState`
  - `FORCE_UNLOCK_AFTER_HOURS = 48`

Why a separate file: there is no component-test setup in this repo — Reanimated 4
throws on import under Jest — so logic that matters has to live outside a
renderer to be tested at all. This mirrors `participationMutations` in
`useEventParticipation.ts`.

Note this function deliberately **does not** compute the threshold; it reads
`contributorsNeeded` off the status. See Global Constraints.

- [ ] **Step 1: Write the failing test.** Create
      `src/utils/__tests__/wrapGate.test.ts`:

```ts
import { wrapGateState } from '../wrapGate';
import { WrapStatus } from '@/types/models';

const base: WrapStatus = {
  coAttendeeCount: 5,
  ratedCount: 5,
  myPhotoCount: 1,
  votedCategories: ['mvp', 'first_to_arrive', 'next_host', 'best_vibes'],
  feedbackDone: true,
  isHost: false,
  viewCount: 1,
  encoreRequested: false,
  encoreCount: 0,
  contributorCount: 0,
  contributorsNeeded: 3,
  contributors: [],
  hoursSinceEnd: 1,
};

const s = (o: Partial<WrapStatus> = {}): WrapStatus => ({ ...base, ...o });

describe('wrapGateState', () => {
  it('is locked while the status is still loading', () => {
    expect(wrapGateState(undefined)).toBe('locked');
  });

  it('is locked when my own steps are unfinished, however many contributed', () => {
    expect(wrapGateState(s({ myPhotoCount: 0, contributorCount: 9 }))).toBe(
      'locked'
    );
  });

  it('is locked when I am done but the group has not reached the threshold', () => {
    expect(wrapGateState(s({ contributorCount: 2 }))).toBe('locked');
  });

  it('opens once the group reaches the threshold', () => {
    expect(wrapGateState(s({ contributorCount: 3 }))).toBe('open');
  });

  it('opens when the group overshoots the threshold', () => {
    expect(wrapGateState(s({ contributorCount: 8 }))).toBe('open');
  });

  it('becomes unlockable at 48 hours when the group never showed up', () => {
    expect(wrapGateState(s({ contributorCount: 1, hoursSinceEnd: 49 }))).toBe(
      'unlockable'
    );
  });

  it('is still locked at exactly 48 hours', () => {
    expect(wrapGateState(s({ contributorCount: 1, hoursSinceEnd: 48 }))).toBe(
      'locked'
    );
  });

  it('never offers a force-unlock to someone who has not done their own steps', () => {
    expect(
      wrapGateState(s({ myPhotoCount: 0, contributorCount: 1, hoursSinceEnd: 99 }))
    ).toBe('locked');
  });

  it('prefers open over unlockable when both would apply', () => {
    expect(
      wrapGateState(s({ contributorCount: 5, hoursSinceEnd: 99 }))
    ).toBe('open');
  });

  it('is host-aware: a host with no feedback is still done', () => {
    expect(
      wrapGateState(s({ isHost: true, feedbackDone: false, contributorCount: 3 }))
    ).toBe('open');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/utils/__tests__/wrapGate.test.ts --forceExit`
Expected: FAIL — `Cannot find module '../wrapGate'`.

- [ ] **Step 3: Write the implementation.** Create `src/utils/wrapGate.ts`:

```ts
import { WrapStatus } from '@/types/models';
import { wrapStepsDone, wrapStepTotal } from '@/hooks/useWrap';

// After this long, someone who finished their own steps can open the recap even
// though the group never reached the threshold.
//
// Without this escape hatch a three-person event where the other two never
// reopen the app locks the recap PERMANENTLY for the one person who did
// everything — punished for participating. That is the likeliest way this
// feature fails in the wild.
//
// This is NOT the contribution window. Contributing stays open for seven days
// (`wrap_window_open`, migration 032), so the count can still cross the
// threshold on day four and open the wrap the honest way.
export const FORCE_UNLOCK_AFTER_HOURS = 48;

export type WrapGateState =
  | 'locked' // waiting on other people
  | 'unlockable' // 48h passed, the group never arrived, you may open it anyway
  | 'open'; // the group showed up

// Whether the recap is available, and if not, why not.
//
// Deliberately does NOT compute the threshold: `contributorsNeeded` comes from
// `get_wrap_gate` (migration 075). If this recomputed it, two app versions could
// disagree about whether a wrap is unlocked.
export function wrapGateState(
  status: WrapStatus | undefined
): WrapGateState {
  if (!status) return 'locked';

  // Your own steps are the price of entry either way — the escape hatch is for
  // a quiet group, not for skipping your own contribution.
  const mine = wrapStepsDone(status) >= wrapStepTotal(status);
  if (!mine) return 'locked';

  if (status.contributorCount >= status.contributorsNeeded) return 'open';
  if (status.hoursSinceEnd > FORCE_UNLOCK_AFTER_HOURS) return 'unlockable';
  return 'locked';
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest src/utils/__tests__/wrapGate.test.ts --forceExit`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: green, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/wrapGate.ts src/utils/__tests__/wrapGate.test.ts
git commit -m "feat(wrap): the unlock rule as a pure, tested function"
```

---

### Task 5: Wire the wrap hub — group gate, contributor row, force-unlock

**Files:**
- Modify: `app/events/wrap/[eventId].tsx` (`recapUnlocked` at :65; recap card
  at ~:217-246)

**Interfaces:**
- Consumes: `wrapGateState`, `WrapGateState` (Task 4); `status.contributors`,
  `status.contributorCount`, `status.contributorsNeeded` (Task 3);
  `ConfirmDialog` (`visible`, `onClose`, `title`, `body?`, `icon?`,
  `confirmLabel`, `cancelLabel?`, `onConfirm`, `tone?`).
- Produces: no new exports.

- [ ] **Step 1: Replace the unlock rule.** At `app/events/wrap/[eventId].tsx:65`,
      replace:

```tsx
  const recapUnlocked = !!status && done >= total;
```

with:

```tsx
  // The recap now opens on the GROUP's progress, not just yours — see
  // src/utils/wrapGate.ts for why the 48h escape hatch is not optional.
  const gate = wrapGateState(status);
  const recapUnlocked = gate === 'open' || forceUnlocked;
```

- [ ] **Step 2: Add the force-unlock state.** Beside the existing
      `const [shareOpen, setShareOpen] = useState(false);` (:41), add:

```tsx
  // Session-scoped on purpose: re-confirming on a later visit is one tap, and
  // it keeps restating that the wrap is thin. Promote to SecureStore (the
  // pattern in themeStore.ts) only if that proves annoying on device.
  const [forceUnlocked, setForceUnlocked] = useState(false);
  const [forcePromptOpen, setForcePromptOpen] = useState(false);
```

- [ ] **Step 3: Add the imports.** Extend the existing import block:

```tsx
import { wrapGateState } from '@/utils/wrapGate';
import { ConfirmDialog, Avatar } from '@/components/ui';
```

  (Merge `ConfirmDialog` / `Avatar` into the existing `@/components/ui` import
  rather than adding a second one.)

- [ ] **Step 4: Make the recap card reflect all three states.** Replace the
      `onPress`, `disabled` and `recapSub` of the "Night in numbers"
      `PressableScale` (~:220-245):

```tsx
            onPress={() => {
              if (recapUnlocked) router.push(`/events/wrap/recap/${eventId}`);
              else if (gate === 'unlockable') setForcePromptOpen(true);
            }}
            disabled={gate === 'locked'}
```

and the subtitle `Text`:

```tsx
              <Text style={styles.recapSub}>
                {recapUnlocked
                  ? 'Winners, thumbs and totals from the night'
                  : gate === 'unlockable'
                    ? `Only ${status?.contributorCount ?? 0} of ${
                        status?.contributorsNeeded ?? 0
                      } contributed — open it anyway`
                    : done < total
                      ? `Finish ${total - done} more ${
                          total - done === 1 ? 'step' : 'steps'
                        } to unlock`
                      : `Waiting on ${
                          (status?.contributorsNeeded ?? 0) -
                          (status?.contributorCount ?? 0)
                        } more ${
                          (status?.contributorsNeeded ?? 0) -
                            (status?.contributorCount ?? 0) ===
                          1
                            ? 'person'
                            : 'people'
                        }`}
              </Text>
```

  Note the two distinct locked messages: "finish your steps" versus "waiting on
  other people" are different problems with different fixes, and one message for
  both would be a lie in one of the cases.

- [ ] **Step 5: Show who contributed.** Directly above the "Night in numbers"
      `Animated.View`, add:

```tsx
        {/* Who has already contributed. This is the incentive — a tally with
            faces invites you to join it. Names of who has NOT contributed are
            deliberately never shown. */}
        {status && status.contributors.length > 0 && (
          <Animated.View entering={FadeInDown.delay(230).duration(350)}>
            <View style={styles.contribRow}>
              <View style={styles.contribFaces}>
                {status.contributors.slice(0, 5).map((c) => (
                  <Avatar
                    key={c.id}
                    photoUrl={c.photo_url}
                    name={c.name}
                    size={26}
                    style={styles.contribFace}
                  />
                ))}
              </View>
              <Text style={styles.contribText}>
                {status.contributorCount} of {status.contributorsNeeded}{' '}
                contributed
              </Text>
            </View>
          </Animated.View>
        )}
```

- [ ] **Step 6: Add its styles** to the `themedStyles` block at the bottom:

```tsx
  contribRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    paddingHorizontal: SPACING[1],
  },
  contribFaces: { flexDirection: 'row' },
  contribFace: { marginRight: -SPACING[2] },
  contribText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
```

  `Avatar`'s props are `name` / `photoUrl` / `size` / `style`
  (`src/components/ui/Avatar.tsx:13`) — note it is `photoUrl`, **not** `uri`.
  It renders an initial from `name` when `photoUrl` is null, so the no-photo
  case needs no extra handling.

- [ ] **Step 7: Add the force-unlock dialog.** Beside the existing
      `<ShareWrapSheet ... />` before `</Screen>`:

```tsx
      <ConfirmDialog
        visible={forcePromptOpen}
        onClose={() => setForcePromptOpen(false)}
        icon="lock"
        title="Not everyone showed up"
        body={`Only ${status?.contributorCount ?? 0} of ${
          status?.contributorsNeeded ?? 0
        } people added to this wrap. You can open it anyway — it will just be a thinner night.`}
        confirmLabel="Open it anyway"
        cancelLabel="Wait a bit"
        onConfirm={() => {
          setForceUnlocked(true);
          setForcePromptOpen(false);
          router.push(`/events/wrap/recap/${eventId}`);
        }}
      />
```

- [ ] **Step 8: Typecheck, test, lint**

Run: `npm run typecheck && npm test && npm run lint`
Expected: 0 type errors; tests green; no new lint warnings.

- [ ] **Step 9: Commit**

```bash
git add "app/events/wrap/[eventId].tsx"
git commit -m "feat(wrap): the recap opens on the group, with a 48h way out"
```

---

### Task 6: Migration 076 — tell the contributors it opened

**Files:**
- Create: `supabase/migrations/076_wrap_unlocked_notification.sql`
- Modify: `src/types/models.ts` (`NotificationType` union, ~:70)
- Modify: `src/utils/notificationCopy.ts`
- Modify: `src/constants/notificationStyle.ts`
- Modify: `src/hooks/useNotifications.ts` (tap routing, ~:67)

**Interfaces:**
- Produces: `notification_type` gains `'wrap_unlocked'`;
  `events.wrap_unlocked_notified BOOLEAN`; a trigger on `wrap_contributions`.

Without this the mechanic pays off **invisibly** (spec §4.5). The people who
contribute first wait the longest, and nothing tells them the wait ended.

**Only contributors are notified.** For anyone else the wrap is still locked —
§4.3 is `myStepsDone AND contributorCount >= N` — so "the wrap is open" would be
false, and a push announcing a door you cannot walk through teaches people to
ignore the channel.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- WRAP UNLOCKED. Fires once per event, the moment the contributor count first
-- reaches the threshold, to the people who contributed.
--
-- Only contributors: for everyone else the recap is still locked (their own
-- steps are unfinished), so "the wrap is open" would be a lie. The Home card
-- and the chat pin are what nag a non-contributor.
--
-- Guarded by a once-only column in the same shape as wrap_ready_notified (032).
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'wrap_unlocked';

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS wrap_unlocked_notified BOOLEAN DEFAULT FALSE;

CREATE OR REPLACE FUNCTION notify_wrap_unlocked()
RETURNS TRIGGER AS $$
DECLARE
  v_size    INT;
  v_needed  INT;
  v_count   INT;
  v_flagged BOOLEAN;
BEGIN
  SELECT e.wrap_unlocked_notified INTO v_flagged
    FROM events e WHERE e.id = NEW.event_id;
  IF v_flagged THEN RETURN NULL; END IF;

  -- Same size and threshold arithmetic as get_wrap_gate (075). Duplicated
  -- deliberately: a trigger cannot call a RETURNS TABLE function cheaply, and
  -- the alternative is a SECURITY DEFINER round trip per contribution.
  -- If the formula in 075 changes, change it HERE TOO — nothing will error.
  SELECT 1 + (
    SELECT COUNT(*) FROM event_participants ep
     WHERE ep.event_id = e.id
       AND ep.status   = 'approved'
       AND ep.user_id <> e.host_id
  ) INTO v_size
    FROM events e WHERE e.id = NEW.event_id;

  v_needed := LEAST(v_size, GREATEST(2, LEAST(5, CEIL(v_size / 2.0)::INT)));

  SELECT COUNT(*) INTO v_count
    FROM wrap_contributions wc WHERE wc.event_id = NEW.event_id;

  IF v_count < v_needed THEN RETURN NULL; END IF;

  INSERT INTO notifications (user_id, actor_id, type, event_id, created_at)
  SELECT wc.user_id, NULL, 'wrap_unlocked', NEW.event_id, NOW()
    FROM wrap_contributions wc
   WHERE wc.event_id = NEW.event_id;

  UPDATE events SET wrap_unlocked_notified = TRUE WHERE id = NEW.event_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS wrap_contributions_unlock ON wrap_contributions;
CREATE TRIGGER wrap_contributions_unlock
  AFTER INSERT ON wrap_contributions
  FOR EACH ROW EXECUTE FUNCTION notify_wrap_unlocked();
```

  **Confirm the `notifications` insert columns against an existing sender** —
  copy the column list from `032_wrap.sql:559` (the `wrap_ready` insert) rather
  than trusting the shape above.

- [ ] **Step 2: Apply it** whole-file. `ALTER TYPE ... ADD VALUE` cannot run
      inside a transaction block in older Postgres — if the editor complains,
      run that one line on its own first.

- [ ] **Step 3: Add the type.** In `src/types/models.ts`, add to the
      `NotificationType` union beside `'wrap_ready'`:

```ts
  | 'wrap_unlocked'
```

- [ ] **Step 4: Add the copy.** In `src/utils/notificationCopy.ts`, beside the
      `wrap_ready` case:

```ts
    case 'wrap_unlocked':
      return {
        title: 'The wrap is open',
        body: `Enough of you showed up for ${eventTitle} — go see it`,
      };
```

  **Also fix `wrap_ready`'s body in the same edit.** It currently reads
  *"Rate the people, drop your best photos, vote superlatives"*, which is wrong
  once awards stop being a separate step and the CTA becomes "Wrap it up":

```ts
    case 'wrap_ready':
      return {
        title: `How was ${eventTitle}?`,
        body: 'Add your photos and the people you met — wrap it up',
      };
```

- [ ] **Step 5: Add the style.** In `src/constants/notificationStyle.ts`, beside
      the `wrap_ready` entry:

```ts
  wrap_unlocked: { icon: 'gallery', color: '#FF5E5B', tint: '#FFF0EF' },
```

  Confirm `gallery` is a registered `IconName`; if not, reuse `'camera'` as
  `wrap_ready` does rather than adding a glyph in this task.

- [ ] **Step 6: Route the tap.** In `src/hooks/useNotifications.ts` (~:67), the
      `wrap_ready` branch routes to the wrap. Send `wrap_unlocked` to the recap
      itself — it is open now, so landing on the hub adds a tap:

```ts
  if (type === 'wrap_unlocked' && eventId) {
    router.push(`/events/wrap/recap/${eventId}`);
    return;
  }
```

- [ ] **Step 7: Verify by hand** in the SQL editor. On a test event, insert
      `wrap_contributions` rows one at a time and confirm **no** notifications
      appear until the threshold row lands, then exactly one per contributor,
      then none ever again:

```sql
SELECT type, COUNT(*) FROM notifications
 WHERE event_id = '<test event>' AND type = 'wrap_unlocked'
 GROUP BY type;
```

- [ ] **Step 8: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add supabase/migrations/076_wrap_unlocked_notification.sql \
        src/types/models.ts src/utils/notificationCopy.ts \
        src/constants/notificationStyle.ts src/hooks/useNotifications.ts
git commit -m "feat(wrap): tell the contributors when the wrap opens (076)"
```

---

### Task 7: The device test sheet

**Files:**
- Create: `docs/testing/wrap-social-gate-phase-1.md`

There is no component or screen test coverage in this repo, so **`tsc` passing
does not mean the UI is right**. An untested change with a sheet is a known
quantity; without one it is a guess that reads like a result.

- [ ] **Step 1: Write the sheet.** Order by risk, not by feature, and mark which
      rows check *reasoning* rather than something already observed.

```markdown
# Wrap social gate — Phase 1 device sheet

Migrations **074**, **075** and **076** must be applied before any of this.
Tick per platform. Rows marked ⚠️ are checking reasoning, not an observed bug —
they are the ones worth someone's time.

## 1. The deadlock (highest risk — the way this feature fails)
| | iOS | Android |
|---|---|---|
| ⚠️ 3-person event, only you contribute, <48h → recap locked, reads "Waiting on 1 more person" | | |
| ⚠️ Same event after 48h → card becomes tappable, dialog offers "Open it anyway" | | |
| ⚠️ Confirming opens the recap and does not crash on a thin/empty wrap | | |
| ⚠️ Someone who has NOT finished their own steps never sees the force-unlock, even after 48h | | |

## 2. Threshold boundaries
| | iOS | Android |
|---|---|---|
| 2-person event needs 2 | | |
| 6-person event needs 3 | | |
| 10-person event needs 5 | | |
| ⚠️ 20+ person event still needs only 5 (the cap) | | |

## 3. Contributor list
| | iOS | Android |
|---|---|---|
| Faces appear as people finish the flow | | |
| Count reads "N of M contributed" and matches the faces | | |
| ⚠️ More than 5 contributors → list caps at 5 without overflowing the row | | |
| ⚠️ A contributor with no photo renders an initial, not a blank circle | | |

## 4. The unlock notification
| | iOS | Android |
|---|---|---|
| ⚠️ Nothing fires until the threshold row lands | | |
| ⚠️ At the threshold, every contributor gets exactly one | | |
| ⚠️ A non-contributor gets **none** — the wrap is still shut for them | | |
| ⚠️ Further contributions after the threshold fire nothing | | |
| Tapping it opens the recap, not the hub | | |
| `wrap_ready`'s body no longer mentions superlatives | | |

## 5. Regressions — the seven policies NOT changed
| | iOS | Android |
|---|---|---|
| ⚠️ Adding a photo on day 3 still works (wrap_window_open untouched) | | |
| ⚠️ Rating someone on day 3 still works | | |
| ⚠️ Requesting encore on day 3 still works | | |
| The wrap hub still loads for an event with zero contributors | | |
| A non-attendee still hits the "this wrap is for attendees" guard | | |

## 6. Android-specific
| | Android |
|---|---|
| ⚠️ Contributor row legible on flat glass (no backdrop blur on Android) | |
| ⚠️ ConfirmDialog body text not clipped at the longest copy | |
| ⚠️ The unlock notification opens the recap from a cold start | |
```

- [ ] **Step 2: Commit**

```bash
git add docs/testing/wrap-social-gate-phase-1.md
git commit -m "docs(wrap): device test sheet for the social gate"
```

---

## Verification

- `npm run typecheck` → 0
- `npm test` → green (10 new tests in `wrapGate.test.ts`)
- `npm run lint` → 0 errors, no new warnings
- Migrations **074**, **075** and **076** applied whole-file in the Supabase SQL
  editor
- The threshold table in Task 2 Step 3 matches spec §4.2 exactly
- `get_wrap_gate` raises for a non-attendee (Task 2 Step 4)
- The device sheet in `docs/testing/` is filled in, or its gaps stated plainly

## What can break silently

Per `AGENTS.md`, these fail with no type error, no lint warning, no test failure:

1. **`contributor_count` left as a string.** `BIGINT` serialises as a string over
   PostgREST; `'3' >= 3` is true but `'10' >= 3` is **false**. Task 3 Step 5
   wraps it in `Number(...)` for exactly this reason.
2. **The threshold reimplemented client-side.** Two app versions would disagree
   about whether a wrap is unlocked. It lives in migration 075 only.
3. **Event size computed as `coAttendeeCount`.** That excludes the viewer
   (`wrap.service.ts:78`) and would shift every threshold by one.
4. **`wrap_window_open` changed to 48h.** Seven RLS policies would close at once
   and contributing would die on day three. It stays at 7 days.
5. **Cache not invalidated after contributing.** Phase 2 writes the marker row;
   it must invalidate `queryKeys.wrap.of(eventId, userId)` or the count sticks.

## Out of scope for this phase

The contribution flow (Phase 2) and the surfaces — launch dealt card, chat pin,
Home variants (Phase 3). Nothing here writes a `wrap_contributions` row; until
Phase 2 lands the count stays 0 and every wrap sits locked until 48h, which is
the correct intermediate state.
