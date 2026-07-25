# Community Phase 4 — Polls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Post a poll — a question with 2–4 options and a 1/3/7-day timer — where
each viewer who can see the post votes **once** (DB-enforced), the vote is
**locked**, results are **hidden until you vote** then animate in as bars, votes
are **anonymous** (counts only), and when the timer expires the author is notified
with the winner (`poll_closed`).

**Architecture:** Three new tables — `polls` (1:1 with a `type='poll'` post,
carries `closes_at`), `poll_options` (2–4 rows, trigger-maintained `vote_count`),
`poll_votes` (**`UNIQUE(poll_id, user_id)`** — the real integrity guard, the UI's
disabled state is cosmetic). No feed-RPC change: a poll card loads its own data
via `usePoll(postId)` (options + counts + my vote + `closes_at`), mirroring how
comments load per-post. Voting inserts one immutable row (RLS: insert-only, and
only on a post you can see → post visibility respected). `poll_closed` fires from
a **pg_cron** job (the 023/032 pattern) that finds newly-expired polls and
notifies the author with the winner. Compose adds a **Post | Poll** segmented
toggle inside the existing `ComposePostSheet` (one composer, one entry point).

**Tech Stack:** Supabase plpgsql + pg_cron, TanStack Query v5, Reanimated 4,
expo-haptics.

## Global Constraints
- Never hardcode a colour/font/radius — `COLORS` / `FONTS` / `TYPE_SIZE` / `RADIUS` / `SPACING`.
- No new glass tier — poll cards are `panel` (like text posts), ink contents (spec §12).
- `notification_type` lives in **two** places (PG enum + TS union); copy in
  **three** surfaces (`notificationCopy.ts`, `send-push-notification`'s
  `composeCopy`, `app/notifications.tsx`'s `notifText` + `onPressNotif`).
- Integrity is **DB-enforced**: `UNIQUE(poll_id, user_id)`; votes are insert-only
  (no update/delete RLS) → locked; results anonymous (never expose voter→option).
- Compose reuses `ComposePostSheet`'s bespoke segmented-chip pattern for the new
  Post|Poll and duration toggles — do not add a `Button` pill.
- `selectionAsync()` on the compose type/duration toggles + on poll option focus;
  `impactAsync(Light)` on a vote tap (spec §12).
- pg_cron is already enabled + used (023 event_starting_soon, 032 wrap_ready) —
  follow that exact register/unschedule idiom.

---

### Task 1: Migration 058 — polls schema, RLS, vote-count trigger, poll_closed cron

**Files:**
- Create: `supabase/migrations/058_polls.sql`

**Interfaces:**
- Produces: `polls(post_id PK/FK, closes_at, closed_notified)`,
  `poll_options(id, poll_id, idx, label, vote_count)`,
  `poll_votes(poll_id, option_id, user_id, UNIQUE(poll_id,user_id))`;
  `notification_type` gains `poll_closed`; a cron job `close-expired-polls`.

Design notes:
- `polls.post_id` is both PK and FK → strict 1:1 with the post; `ON DELETE CASCADE`
  so deleting the post removes the poll, options and votes.
- `poll_options.vote_count` is trigger-maintained (votes are immutable, so INSERT
  only — no decrement path needed).
- Vote RLS: insert only your own vote, only on a poll whose post you can see
  (defers to posts RLS via `post_id IN (SELECT id FROM posts)`), and only while
  open (`closes_at > now()`). No UPDATE/DELETE policy at all → locked.
- Anonymity: `poll_votes` SELECT is restricted to **your own** row (so the client
  can read "did I vote / which option"), never other people's — aggregate counts
  come from `poll_options.vote_count`, not from reading votes.
- `poll_closed` cron: notify the post author once with the top option; ties break
  on lowest `idx` (deterministic). Mirrors 023's `starting_soon_notified` flag.
- Header must NOT start a line with the `COMMENT` keyword (editor splitter). Run
  whole file in the SQL editor.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- POLLS. A poll is a type='poll' post plus one polls row (closes_at), 2-4
-- poll_options (trigger-maintained vote_count), and poll_votes with a UNIQUE
-- (poll_id, user_id) — the real one-vote guard. Votes are insert-only (no
-- update/delete policy) so a cast is LOCKED. Results are anonymous: you may read
-- only your OWN vote row; everyone reads aggregate vote_count. A pg_cron job
-- notifies the author 'poll_closed' with the winner once the timer expires
-- (023/032 pattern). Voting defers to posts RLS, so post visibility is respected.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'poll_closed';

CREATE TABLE IF NOT EXISTS polls (
  post_id         UUID PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  closes_at       TIMESTAMPTZ NOT NULL,
  closed_notified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poll_options (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id    UUID NOT NULL REFERENCES polls(post_id) ON DELETE CASCADE,
  idx        INT  NOT NULL,           -- 0-based display order
  label      TEXT NOT NULL,
  vote_count INT  NOT NULL DEFAULT 0,
  UNIQUE (poll_id, idx)
);
CREATE INDEX IF NOT EXISTS poll_options_poll_idx ON poll_options (poll_id);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id    UUID NOT NULL REFERENCES polls(post_id) ON DELETE CASCADE,
  option_id  UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (poll_id, user_id)      -- one vote per user per poll (the guard)
);
CREATE INDEX IF NOT EXISTS poll_votes_option_idx ON poll_votes (option_id);

ALTER TABLE polls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes   ENABLE ROW LEVEL SECURITY;

-- polls / poll_options: readable iff you can read the post (defers to posts RLS).
DROP POLICY IF EXISTS "polls_select" ON polls;
CREATE POLICY "polls_select" ON polls
  FOR SELECT TO authenticated USING (post_id IN (SELECT id FROM posts));

DROP POLICY IF EXISTS "poll_options_select" ON poll_options;
CREATE POLICY "poll_options_select" ON poll_options
  FOR SELECT TO authenticated USING (poll_id IN (SELECT id FROM posts));

-- Insert: only the post author seeds the poll + its options (they own the post).
DROP POLICY IF EXISTS "polls_insert" ON polls;
CREATE POLICY "polls_insert" ON polls
  FOR INSERT TO authenticated WITH CHECK (
    post_id IN (SELECT id FROM posts WHERE author_id = auth.uid())
  );
DROP POLICY IF EXISTS "poll_options_insert" ON poll_options;
CREATE POLICY "poll_options_insert" ON poll_options
  FOR INSERT TO authenticated WITH CHECK (
    poll_id IN (SELECT id FROM posts WHERE author_id = auth.uid())
  );

-- Votes: you may read only your OWN vote (anonymity); insert only your own vote,
-- only on a visible poll, only while open. No UPDATE/DELETE policy → locked.
DROP POLICY IF EXISTS "poll_votes_select_own" ON poll_votes;
CREATE POLICY "poll_votes_select_own" ON poll_votes
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "poll_votes_insert" ON poll_votes;
CREATE POLICY "poll_votes_insert" ON poll_votes
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND poll_id IN (SELECT id FROM posts)
    AND EXISTS (
      SELECT 1 FROM polls pl WHERE pl.post_id = poll_votes.poll_id
        AND pl.closes_at > NOW()
    )
    AND option_id IN (SELECT id FROM poll_options WHERE poll_id = poll_votes.poll_id)
  );

-- vote_count maintenance (insert-only; votes are immutable).
CREATE OR REPLACE FUNCTION on_poll_vote()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE poll_options SET vote_count = vote_count + 1 WHERE id = NEW.option_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_poll_vote ON poll_votes;
CREATE TRIGGER on_poll_vote
  AFTER INSERT ON poll_votes
  FOR EACH ROW EXECUTE FUNCTION on_poll_vote();

-- poll_closed: once past closes_at, notify the author with the winning option
-- (ties → lowest idx). One notification per poll (closed_notified flag).
CREATE OR REPLACE FUNCTION notify_closed_polls()
RETURNS void AS $$
DECLARE
  due_ids UUID[];
BEGIN
  SELECT array_agg(post_id) INTO due_ids
  FROM polls
  WHERE closed_notified = FALSE AND closes_at <= NOW();

  IF due_ids IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (recipient_id, sender_id, type, payload)
  SELECT p.author_id, NULL, 'poll_closed',
         jsonb_build_object(
           'post_id', p.id,
           'question', p.body,
           'winner', win.label,
           'votes', win.vote_count)
  FROM posts p
  JOIN LATERAL (
    SELECT o.label, o.vote_count
    FROM poll_options o
    WHERE o.poll_id = p.id
    ORDER BY o.vote_count DESC, o.idx ASC
    LIMIT 1
  ) win ON TRUE
  WHERE p.id = ANY(due_ids);

  UPDATE polls SET closed_notified = TRUE WHERE post_id = ANY(due_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('close-expired-polls');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'close-expired-polls',
  '*/5 * * * *',
  $$SELECT notify_closed_polls()$$
);
```

- [ ] **Step 2: Commit** (`feat(community): polls schema + RLS + poll_closed cron (058)`)

---

### Task 2: TS types + notification copy (3 surfaces)

**Files:**
- Modify: `src/types/models.ts` (`NotificationType`; `Poll`/`PollOption` interfaces)
- Modify: `src/utils/notificationCopy.ts`
- Modify: `supabase/functions/send-push-notification/index.ts` (`composeCopy`)
- Modify: `app/notifications.tsx` (`notifText` + `onPressNotif`)
- Test: `src/utils/__tests__/notificationCopy.test.ts`

**Interfaces:**
- Produces: `'poll_closed'` valid end-to-end; client `Poll` / `PollOption` types:

  ```ts
  export interface PollOption {
    id: string;
    idx: number;
    label: string;
    vote_count: number;
  }
  export interface Poll {
    post_id: string;
    closes_at: string;
    options: PollOption[];
    my_option_id: string | null; // which option I voted for, null if I haven't
  }
  ```

- [ ] **Step 1: Failing test** — add to `notificationCopy.test.ts`:

```ts
it('poll_closed reads "your poll closed"', () => {
  expect(notificationCopy('poll_closed', { senderName: 'Mello' }).body)
    .toBe('Your poll has closed — see the results');
});
```

- [ ] **Step 2: Run → fail.** `npx jest notificationCopy --forceExit`.

- [ ] **Step 3: Implement.**
  - `models.ts`: add `| 'poll_closed'` to `NotificationType`; add the `PollOption`
    and `Poll` interfaces next to `CommunityPost`.
  - `notificationCopy.ts`: add
    ```ts
    case 'poll_closed':
      // System-sent (sender_id NULL) — no actor prefix; the row shows the app.
      return { title: 'Poll closed', body: 'Your poll has closed — see the results' };
    ```
  - edge fn `composeCopy`: add
    ```ts
    case 'poll_closed':
      return { title: 'Poll closed', body: 'Your poll has closed — see the results' };
    ```
  - `app/notifications.tsx`: `notifText` →
    `case 'poll_closed':\n  return <>Your poll has closed — see the results</>;`
    (no `who`, it's system-sent); `onPressNotif` → add `case 'poll_closed':` to
    the group that does `dismiss(() => router.push('/(tabs)/community'))`.

- [ ] **Step 4: Run → pass** + `npm run typecheck` → 0. Commit
  (`feat(community): poll_closed notification copy + Poll types`).

---

### Task 3: Service — polls.service.ts

**Files:**
- Create: `src/services/community/polls.service.ts`

**Interfaces:**
- Consumes: `supabase`, `Poll`/`PollOption`.
- Produces:
  - `createPoll({ authorId, question, options, durationDays, visibility, city }) => Promise<string>`
  - `getPoll(postId, viewerId) => Promise<Poll>`
  - `castVote({ pollId, optionId, userId }) => Promise<void>`

- [ ] **Step 1: Write the service.**

```ts
import { supabase } from '@/services/supabase';
import { Poll, PollOption, PostVisibility } from '@/types/models';

const DAY_MS = 24 * 60 * 60 * 1000;

// A poll is authored in three writes (no RPC): the post (type='poll', body =
// question), the polls row (closes_at), then the options. The post's RLS +
// polls_insert/poll_options_insert policies gate each. Returns the post id.
export async function createPoll(params: {
  authorId: string;
  question: string;
  options: string[]; // 2–4 non-empty, ordered
  durationDays: 1 | 3 | 7;
  visibility: PostVisibility;
  city: string | null;
}): Promise<string> {
  const question = params.question.trim();
  const { data: post, error: postErr } = await supabase
    .from('posts')
    .insert({
      author_id: params.authorId,
      type: 'poll',
      body: question,
      visibility: params.visibility,
      city: params.city,
    })
    .select('id')
    .single();
  if (postErr) throw postErr;
  const postId = (post as { id: string }).id;

  const closesAt = new Date(Date.now() + params.durationDays * DAY_MS).toISOString();
  const { error: pollErr } = await supabase
    .from('polls')
    .insert({ post_id: postId, closes_at: closesAt });
  if (pollErr) throw pollErr;

  const rows = params.options
    .map((label) => label.trim())
    .filter((label) => label.length > 0)
    .map((label, idx) => ({ poll_id: postId, idx, label }));
  const { error: optErr } = await supabase.from('poll_options').insert(rows);
  if (optErr) throw optErr;

  return postId;
}

// One poll's render data: options + counts, closes_at, and (from the viewer's
// own vote row — the only one RLS lets them read) which option they picked.
export async function getPoll(postId: string, viewerId: string): Promise<Poll> {
  const [{ data: poll, error: pErr }, { data: options, error: oErr }, { data: myVote }] =
    await Promise.all([
      supabase.from('polls').select('post_id, closes_at').eq('post_id', postId).single(),
      supabase
        .from('poll_options')
        .select('id, idx, label, vote_count')
        .eq('poll_id', postId)
        .order('idx', { ascending: true }),
      supabase
        .from('poll_votes')
        .select('option_id')
        .eq('poll_id', postId)
        .eq('user_id', viewerId)
        .maybeSingle(),
    ]);
  if (pErr) throw pErr;
  if (oErr) throw oErr;
  return {
    post_id: postId,
    closes_at: (poll as { closes_at: string }).closes_at,
    options: (options ?? []) as PollOption[],
    my_option_id: (myVote as { option_id: string } | null)?.option_id ?? null,
  };
}

// Cast a locked vote. The UNIQUE(poll_id,user_id) constraint + insert-only RLS
// are the real guard; a duplicate throws (surfaced as an already-voted error).
export async function castVote(params: {
  pollId: string;
  optionId: string;
  userId: string;
}): Promise<void> {
  const { error } = await supabase.from('poll_votes').insert({
    poll_id: params.pollId,
    option_id: params.optionId,
    user_id: params.userId,
  });
  if (error) throw error;
}
```

- [ ] **Step 2:** `npm run typecheck` → 0. Commit
  (`feat(community): polls.service (createPoll/getPoll/castVote)`).

---

### Task 4: Query key + hooks (usePoll, useCastVote, useCreatePoll)

**Files:**
- Modify: `src/constants/queryKeys.ts` (`community.poll`)
- Create: `src/hooks/usePoll.ts` (`usePoll`, `useCastVote`)
- Modify: `src/hooks/usePostMutations.ts` (`useCreatePoll`)

**Interfaces:**
- Produces: `queryKeys.community.poll.of(postId)`; `usePoll(postId)` (query);
  `useCastVote(postId)` (mutation, invalidates the poll); `useCreatePoll()`
  (mutation, invalidates feed + userPosts).

- [ ] **Step 1: Query key.** In `queryKeys.ts` `community` family add:

```ts
    poll: {
      all: ['community', 'poll'] as const,
      of: (postId: Id) => ['community', 'poll', postId] as const,
    },
```

- [ ] **Step 2: usePoll + useCastVote.** Create `src/hooks/usePoll.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getPoll, castVote } from '@/services/community/polls.service';
import { useAuthStore } from '@/stores/authStore';

export function usePoll(postId: string) {
  const viewerId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: queryKeys.community.poll.of(postId),
    queryFn: () => getPoll(postId, viewerId!),
    enabled: !!viewerId,
    staleTime: 30_000,
  });
}

// A cast is terminal: on success we refetch the poll (counts + my_option_id
// flip together), which swaps the card from vote buttons to result bars.
export function useCastVote(postId: string) {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: (optionId: string) =>
      castVote({ pollId: postId, optionId, userId: userId! }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.community.poll.of(postId) }),
  });
}
```

- [ ] **Step 3: useCreatePoll.** In `usePostMutations.ts`, import `createPoll` and
  add a hook alongside `useCreatePost` (a plain `useMutation`, not part of the
  `postMutations` factory — its args differ):

```ts
export function useCreatePoll() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  return useMutation({
    mutationFn: (args: {
      question: string;
      options: string[];
      durationDays: 1 | 3 | 7;
      visibility: PostVisibility;
    }) =>
      createPoll({
        authorId: user!.id,
        question: args.question,
        options: args.options,
        durationDays: args.durationDays,
        visibility: args.visibility,
        city: user?.city ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.community.feed.all });
      qc.invalidateQueries({ queryKey: queryKeys.community.userPosts.all });
    },
  });
}
```

  (Add `import { createPoll } from '@/services/community/polls.service';`.)

- [ ] **Step 4:** `npm run typecheck` → 0. Commit
  (`feat(community): usePoll/useCastVote/useCreatePoll hooks`).

---

### Task 5: Compose — Post | Poll toggle + poll fields in ComposePostSheet

**Files:**
- Modify: `src/components/community/ComposePostSheet.tsx`

**Interfaces:**
- Consumes: `useCreatePoll`.

Behaviour: a **Post | Poll** segmented pair at the top (same bespoke chip style as
the visibility row). **Post** mode = today (caption + photos). **Poll** mode: the
`TextField` becomes the **question**; the photo picker hides; **2–4 option**
fields appear with an "Add option" affordance (≤4) and per-row remove (when > 2);
a **duration** segmented pair (**1 / 3 / 7 days**). A poll is valid when the
question is non-empty and **≥2 options are non-empty**. Submitting in Poll mode
calls `useCreatePoll`.

- [ ] **Step 1: State + imports.** Add
  `import { useCreatePoll } from '@/hooks/usePostMutations';` and:

```ts
const [mode, setMode] = useState<'post' | 'poll'>('post');
const [options, setOptions] = useState<string[]>(['', '']);
const [durationDays, setDurationDays] = useState<1 | 3 | 7>(3);
const createPoll = useCreatePoll();
```

  Extend `reset()` to also `setMode('post'); setOptions(['', '']); setDurationDays(3);`.

- [ ] **Step 2: Type toggle.** Render a segmented Post|Poll pair (clone the
  `visRow`/`chip` markup) directly under the header. On press: `selectionAsync()`
  + `setMode(m)`.

- [ ] **Step 3: Poll fields.** When `mode === 'poll'`, after the question
  `TextField` (placeholder → `'Ask a question…'`, keep `MAX`), render:
  - the option rows:

    ```tsx
    {options.map((opt, i) => (
      <View key={i} style={styles.optionRow}>
        <View style={{ flex: 1 }}>
          <TextField
            value={opt}
            onChangeText={(t) =>
              setOptions((prev) => prev.map((o, j) => (j === i ? t.slice(0, 80) : o)))
            }
            placeholder={`Option ${i + 1}`}
            onFocus={() => Haptics.selectionAsync()}
          />
        </View>
        {options.length > 2 ? (
          <NavButton
            icon="close"
            onPress={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
            accessibilityLabel={`Remove option ${i + 1}`}
          />
        ) : null}
      </View>
    ))}
    {options.length < 4 ? (
      <PressableScale
        onPress={() => setOptions((prev) => [...prev, ''])}
        style={styles.addOption}
      >
        <Icon name="plus" size={16} color={COLORS.textSecondary} />
        <Text style={styles.addOptionText}>Add option</Text>
      </PressableScale>
    ) : null}
    ```

  - the duration pair (clone `visRow`/`chip`, labels `1 day` / `3 days` /
    `7 days`, active when `durationDays === n`, `selectionAsync()` on press).
  Hide `<PhotoGridPicker>` and the `@mention` autocomplete strip in poll mode.

- [ ] **Step 4: Gate + submit.** Replace the single `canPost` with mode-aware:

```ts
const filledOptions = options.map((o) => o.trim()).filter((o) => o.length > 0);
const canPost =
  mode === 'post'
    ? (trimmed.length > 0 || hasPhotos) && trimmed.length <= MAX && !create.isPending
    : trimmed.length > 0 && filledOptions.length >= 2 && !createPoll.isPending;
```

  In `submit()`, branch: poll mode →

```ts
createPoll.mutate(
  { question: trimmed, options: filledOptions, durationDays, visibility },
  { onSuccess: () => { Haptics.notificationAsync(Success); reset(); onClose(); },
    onError: () => Haptics.notificationAsync(Error) }
);
```

  Button `loading={mode === 'poll' ? createPoll.isPending : create.isPending}`,
  label stays `"Post"`.

- [ ] **Step 5:** `npm run typecheck` → 0; `npm run lint` on the file → no new.
  Commit (`feat(community): poll compose mode in ComposePostSheet`).

---

### Task 6: Render — PollCard + PostCard poll branch

**Files:**
- Create: `src/components/community/PollCard.tsx`
- Modify: `src/components/community/PostCard.tsx`

**Interfaces:**
- Consumes: `usePoll`, `useCastVote`, `Poll`.
- Produces: `<PollCard postId={string} question={string} />` — before voting (and
  poll still open): the question + tappable option buttons. After voting **or**
  once closed: result **bars that grow from 0** (Reanimated `withTiming`) showing
  each option's share, your pick marked, plus a "N votes · closes in X / closed"
  footer.

- [ ] **Step 1: Build PollCard.**
  - `const poll = usePoll(postId); const vote = useCastVote(postId);`
  - Derive: `const closed = poll.data ? new Date(poll.data.closes_at) <= new Date() : false;`
    `const voted = !!poll.data?.my_option_id;` `const showResults = voted || closed;`
    `const total = poll.data?.options.reduce((s, o) => s + o.vote_count, 0) ?? 0;`
  - **Vote mode** (`!showResults`): map options to `PressableScale` rows (panel-
    inset pills) → `onPress={() => { Haptics.impactAsync(Light); vote.mutate(o.id); }}`,
    disabled while `vote.isPending`.
  - **Result mode**: each option is a row with a background bar whose width is an
    animated `${share}%` (`useSharedValue` → `withTiming` on mount / when data
    arrives), the label, the percentage, and a check on `my_option_id`. Use
    `COLORS` for bar fill (`COLORS.primaryTint` for others, a stronger token for
    your pick — no literals).
  - Footer: `{total} vote{total===1?'':'s'} · {closed ? 'Final' : closesInLabel(closes_at)}`.
    Put `closesInLabel` as a tiny local pure helper (e.g. "closes in 2d / 5h /
    12m"); no new util file for one caller.
  - Loading (`poll.isLoading`): a short skeleton or the question with muted
    placeholder rows — keep it simple, no spinner-only flash.

- [ ] **Step 2: PostCard poll branch.** Add before the action bar, after the photo
  branch:

```tsx
{post.type === 'poll' ? (
  <View style={styles.media}>
    <PollCard postId={post.id} question={post.body ?? ''} />
  </View>
) : null}
```

  (Reuse the existing `styles.media` wrapper for the vertical rhythm; import
  `PollCard`.)

- [ ] **Step 3:** `npm run typecheck` → 0; `npm run lint` on both files → no new;
  `npx jest --forceExit` → green. Commit
  (`feat(community): PollCard render + vote/results animation`).

---

### Verification
- `npm run typecheck` → 0; `npx jest --forceExit` → green; `npm run lint` on
  touched files → no new.
- Apply migration 058 in the Supabase SQL editor (whole file). Confirm the cron
  job registered: `SELECT jobname FROM cron.job WHERE jobname = 'close-expired-polls';`.
- Append a **Phase 4** section to `docs/superpowers/tests/community-manual-qa.md`:
  - **DB / integrity:** a second vote by the same user is **rejected** by
    `UNIQUE(poll_id, user_id)`; there is **no** UPDATE/DELETE policy on
    `poll_votes` (a cast can't be changed); a non-viewer of a friends-only poll
    **cannot** insert a vote (RLS); reading `poll_votes` returns only your own
    row; after `closes_at`, `notify_closed_polls()` inserts one `poll_closed` for
    the author with the top option and flips `closed_notified`.
  - **Device:** compose → Poll mode → question + 2 options (add up to 4, remove
    back to 2) + duration 1/3/7 (`selectionAsync` on toggles/option focus);
    published poll shows options, **no counts before voting**; tapping an option
    (`Light` haptic) locks it and **animates result bars from 0**, your pick
    marked; reopening the feed still shows results (locked); an expired poll is
    read-only and shows Final; author receives "Your poll has closed"; Android
    flat-glass bars/pills legible; friends/public visibility respected for voting.
- Update memory `community-feed-project.md` (Phase 4 done, migration 058 + the
  `close-expired-polls` cron; Phases 5–7 next).
