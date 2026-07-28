# Community Phase 2c — Comment Likes + Reporting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every comment and reply can be liked (optimistic heart + count, coalesced "liked your comment" notification), and any comment can be reported through the existing moderation rails. Rounds out spec §9 ("each comment likeable") and §7 ("report on any comment").

**Architecture:** A `comment_likes` table (composite PK) with a count trigger maintaining `post_comments.like_count` — a direct mirror of `post_likes` (046). The two comment read RPCs gain `liked_by_me`. Likes reuse the `coalesce_notification` helper (049) for a `comment_liked` notification. The `reports` table gains a nullable `comment_id` (+ `post_id`, reserved for Phase 6) so `reportComment` rides the same table/RLS as `reportUser`. UI: a heart on each `CommentRow` (optimistic, mirroring `PostActionBar`) and a contextual overflow (Delete when you can moderate, Report otherwise) via `Alert`.

**Tech Stack:** React Native, Reanimated 4, TanStack Query v5, Supabase (Postgres + RLS + plpgsql triggers), `expo-haptics`.

**Deferred to Phase 2d:** **@mentions** (autocomplete + parsing + tappable rendering + `mention` notification). The `post_comments.mentions` column already exists.

## Global Constraints

- **Expo SDK 56**; **no hardcoded colours/fonts** (`COLORS`/`FONTS`); **new type via `TYPE`/`TYPE_SIZE`**.
- **Reuse first:** `PressableScale`, `Icon`, `Avatar`; the optimistic-like shape from `src/hooks/usePostInteractions.ts`; the coalescing helper `coalesce_notification` (049); `reportUser`/`ReportReason` from `src/services/moderation.service.ts`; the `Alert`-based reason picker from `src/components/events/ParticipantRow.tsx`.
- **Optimistic mutations = the `participationMutations`/`likeMutations` factory pattern** (plain `UseMutationOptions`, testable against a bare `QueryClient`; v5.100 callbacks take a trailing `MutationFunctionContext`).
- **DB conventions:** numbered migrations, run whole in the SQL editor, `CREATE ... IF NOT EXISTS`, RLS with the table, `SECURITY DEFINER` on notify triggers, `SECURITY INVOKER` on read RPCs. **Do not start a SQL comment line with the `COMMENT` keyword** — the Supabase editor's splitter mis-reads it as `COMMENT ON` (bit us in 049/050). Next free migration numbers: **052, 053, 054**.
- **Notification enum in two places** (`notification_type` + TS union); copy in **three** surfaces (`notificationCopy.ts`, edge fn `composeCopy`, `app/notifications.tsx` `notifText` + `onPressNotif`).
- **Verify gates:** `npm run typecheck` at 0; `npm test` green; `npm run lint` no new. Run Jest with `--forceExit`.
- **Testing reality:** no render tests; test the like helper + factory + services. SQL by hand. Visuals: Android-first device check.

---

## File Structure

**Created:**
- `supabase/migrations/052_comment_likes.sql` — table, RLS, count+notify trigger, `comment_liked` enum.
- `supabase/migrations/053_comment_reads_liked_by_me.sql` — `post_comments_ranked` + `post_comment_replies` gain `liked_by_me`.
- `supabase/migrations/054_reports_add_targets.sql` — `reports.comment_id` + `reports.post_id`.
- `src/services/community/commentLikes.service.ts` — `likeComment`, `unlikeComment`.
- `src/services/community/__tests__/commentLikes.service.test.ts`

**Modified:**
- `src/types/models.ts` — `PostComment.liked_by_me`; `NotificationType += 'comment_liked'`.
- `src/utils/notificationCopy.ts`, `supabase/functions/send-push-notification/index.ts`, `app/notifications.tsx` — `comment_liked` copy + tap-nav.
- `src/services/moderation.service.ts` — `reportComment(...)`.
- `src/hooks/useComments.ts` — `commentLikeMutations` factory + `patchCommentLike` helper + `useToggleCommentLike`.
- `src/hooks/__tests__/useComments.test.ts` — helper + factory tests.
- `src/components/community/CommentRow.tsx` — heart control (optimistic) + parentId prop for cache targeting.
- `src/components/community/CommentSheet.tsx` — contextual overflow (Delete / Report) via Alert + `reportComment` mutation.

---

## Task 1: `comment_likes` table + count + coalesced notification

**Files:** Create `supabase/migrations/052_comment_likes.sql`

**Interfaces:**
- Consumes: `post_comments` (048), `posts`, `profiles`, `coalesce_notification` (049).
- Produces: `comment_likes(comment_id, user_id, created_at)` PK `(comment_id, user_id)`; count trigger on `post_comments.like_count`; enum `'comment_liked'`. Consumed by Tasks 2–6.

- [ ] **Step 1: Write the migration** (mirror of `post_likes`/046, notify via the shared helper)

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- LIKES ON COMMENTS: one like per user per comment; count maintained on
-- post_comments.like_count; comment author notified via the coalesced helper
-- (049). Mirror of post_likes (046). Run whole in the SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'comment_liked';

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id UUID NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);
CREATE INDEX IF NOT EXISTS comment_likes_user_idx ON comment_likes (user_id);

ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

-- Visible iff you can read the comment (which defers to the post's RLS).
DROP POLICY IF EXISTS "comment_likes_select" ON comment_likes;
CREATE POLICY "comment_likes_select" ON comment_likes
  FOR SELECT TO authenticated USING (comment_id IN (SELECT id FROM post_comments));

DROP POLICY IF EXISTS "comment_likes_insert" ON comment_likes;
CREATE POLICY "comment_likes_insert" ON comment_likes
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND comment_id IN (SELECT id FROM post_comments)
  );

DROP POLICY IF EXISTS "comment_likes_delete" ON comment_likes;
CREATE POLICY "comment_likes_delete" ON comment_likes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION on_comment_like()
RETURNS TRIGGER AS $$
DECLARE
  v_author UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE post_comments SET like_count = like_count + 1 WHERE id = NEW.comment_id
      RETURNING author_id INTO v_author;
    PERFORM coalesce_notification(v_author, NEW.user_id,
              'comment_liked', 'comment_id', NEW.comment_id);
    RETURN NEW;
  ELSE
    UPDATE post_comments SET like_count = GREATEST(like_count - 1, 0)
      WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_comment_like ON comment_likes;
CREATE TRIGGER on_comment_like
  AFTER INSERT OR DELETE ON comment_likes
  FOR EACH ROW EXECUTE FUNCTION on_comment_like();
```

- [ ] **Step 2: Verify** — like a comment as B → `post_comments.like_count`=1 and one `comment_liked` row for the comment's author; two likers coalesce to one row (`count`=2); self-like adds no notification; unliking floors the count at 0.

- [ ] **Step 3: Commit** — `git commit -m "feat(community): comment_likes table, count + coalesced notification"`

---

## Task 2: comment RPCs return `liked_by_me`

**Files:** Create `supabase/migrations/053_comment_reads_liked_by_me.sql`

**Interfaces:** Produces `post_comments_ranked` / `post_comment_replies` with an added trailing `liked_by_me BOOLEAN` (uses `p_viewer_id`, previously reserved). Consumed by Task 3 (type), Task 5 (patch).

- [ ] **Step 1: Write the migration** — copy the two function bodies from `050_comments_rpcs.sql`, add `liked_by_me` to each `RETURNS TABLE` and select `EXISTS (SELECT 1 FROM comment_likes cl WHERE cl.comment_id = c.id AND cl.user_id = p_viewer_id) AS liked_by_me`. Both need `DROP FUNCTION` first (return-type change). Keep the ranking ORDER BY; optionally add `+ c.like_count` to the score now that likes exist (comment: `like_count * 1`). **Do not** start any comment line with `COMMENT`.

- [ ] **Step 2: Verify** — `post_comments_ranked` returns `liked_by_me` true for a comment the viewer liked, false otherwise; replies likewise.

- [ ] **Step 3: Commit** — `"feat(community): comment RPCs return liked_by_me"`

---

## Task 3: `reports` gains comment/post targets

**Files:** Create `supabase/migrations/054_reports_add_targets.sql`

**Interfaces:** Produces nullable `reports.comment_id` + `reports.post_id`. Consumed by Task 6 (`reportComment`).

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- REPORT TARGETS: reports was person-only (reported_id). Add nullable content
-- targets so a report can point at a specific comment (2c) or post (Phase 6),
-- while reported_id still carries the content's author. RLS is unchanged (insert
-- your own; reads are service-role). Run whole in the SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE reports ADD COLUMN IF NOT EXISTS comment_id UUID
  REFERENCES post_comments(id) ON DELETE CASCADE;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS post_id UUID
  REFERENCES posts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS reports_comment_idx ON reports (comment_id);
CREATE INDEX IF NOT EXISTS reports_post_idx    ON reports (post_id);
```

- [ ] **Step 2: Verify** — insert a report with `comment_id` set as an authenticated user (reporter_id = auth.uid()) succeeds; the columns exist.

- [ ] **Step 3: Commit** — `"feat(community): reports can target a comment or post"`

---

## Task 4: Types + notification copy

**Files:** Modify `models.ts`, `notificationCopy.ts`, edge `composeCopy`, `app/notifications.tsx`.

- [ ] **Step 1:** `PostComment` gains `liked_by_me: boolean;`. `NotificationType += 'comment_liked'`.
- [ ] **Step 2:** Banner + push copy: `comment_liked` → title "New like", body coalesced `${senderName}[ and N others] liked your comment`.
- [ ] **Step 3:** `notifText` list copy: `case 'comment_liked'` → `{who}[ and N others] liked your comment`; add `'comment_liked'` to the feed-routing group in `onPressNotif`.
- [ ] **Step 4:** typecheck + commit `"feat(community): comment_liked type + notification copy"`.

> Adding a required `liked_by_me` to `PostComment` breaks any test fixture that builds one — there is none yet, but grep (`rg "PostComment" src/**/__tests__`) and patch if so.

---

## Task 5: `commentLikes.service` + like mutations

**Files:** Create `src/services/community/commentLikes.service.ts` (+ test); modify `src/hooks/useComments.ts` (+ test).

**Interfaces:**
- Produces: `likeComment({commentId,userId})`, `unlikeComment({commentId,userId})`; `patchCommentLike(...)` pure helper; `commentLikeMutations(qc, postId, userId)` → `{ toggle }` taking `{ commentId, parentId, liked }`; `useToggleCommentLike(postId)`.

- [ ] **Step 1: Service test + impl** — mirror `postLikes.service`: insert/delete on `comment_likes` by `(comment_id, user_id)`.

- [ ] **Step 2: Like-mutation test + impl.** The optimistic patch flips `liked_by_me` + moves `like_count` on the target comment in **whichever cache holds it**: the top-level `queryKeys.community.comments.of(postId)` list, or — when `parentId` is set — the `queryKeys.community.replies.of(parentId)` list. Pure helper:

```typescript
// Patch the one comment (by id) inside a PostComment[] cache.
export function patchCommentLike(
  list: PostComment[] | undefined,
  commentId: string,
  liked: boolean
): PostComment[] | undefined {
  if (!list) return list;
  return list.map((c) =>
    c.id === commentId
      ? { ...c, liked_by_me: !liked, like_count: Math.max(0, c.like_count + (liked ? -1 : 1)) }
      : c
  );
}
```

Factory `commentLikeMutations(qc, postId, userId)`: `toggle.onMutate` cancels + patches `comments.of(postId)` and, if `parentId`, `replies.of(parentId)`; `onError` rolls both back; **no invalidate on settle** (counts reconcile on the next thread refetch — same rationale as post likes). `mutationFn` routes to `likeComment`/`unlikeComment`.

- [ ] **Step 3:** run tests (green), typecheck, commit `"feat(community): comment like service + optimistic mutations"`.

---

## Task 6: `reportComment` service

**Files:** Modify `src/services/moderation.service.ts`.

- [ ] **Step 1:** Add, mirroring `reportUser`:

```typescript
export async function reportComment(params: {
  reporterId: string;
  reportedId: string;   // the comment's author
  commentId: string;
  reason: ReportReason;
  details?: string;
}): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: params.reporterId,
    reported_id: params.reportedId,
    comment_id: params.commentId,
    reason: params.reason,
    details: params.details ?? null,
  });
  if (error) throw error;
}
```

- [ ] **Step 2:** typecheck + commit `"feat(community): reportComment service"`.

---

## Task 7: Heart on `CommentRow`

**Files:** Modify `src/components/community/CommentRow.tsx`.

**Interfaces:** Consumes `useToggleCommentLike` (Task 5). Adds an optional `parentId?: string` prop (set when rendering reply children, = the parent comment id) so the like targets the right cache.

- [ ] **Step 1:** Add a heart control to the actions row (both top-level and reply rows): `PressableScale` + `Icon name="heart" variant={liked_by_me ? 'bold' : 'linear'}` (coral when liked) + the count when > 0. Tap → Light haptic + a subtle timing pop (reuse the `PostActionBar` approach: a `pulse` state counter driving a `useEffect` shared-value write, to stay clear of `react-hooks/immutability`) + `toggle.mutate({ commentId: comment.id, parentId, liked: comment.liked_by_me })`. Hidden on tombstoned rows.
- [ ] **Step 2:** When rendering reply children, pass `parentId={comment.id}`.
- [ ] **Step 3:** typecheck + lint + commit `"feat(community): like a comment (optimistic heart)"`.

> Confirm the heart approach against `PostActionBar.tsx` — same `useEffect`+pulse pattern to satisfy `react-hooks/immutability`; do not write the shared value inside the press handler.

---

## Task 8: Contextual overflow (Delete / Report) in `CommentSheet`

**Files:** Modify `src/components/community/CommentSheet.tsx`.

- [ ] **Step 1:** Replace the delete-only `requestDelete` with a contextual `onOverflow(comment)` that opens an `Alert` action menu:
  - **Delete** (destructive) when `comment.author_id === meId || isPostAuthor` → the existing delete confirm.
  - **Report** when `comment.author_id !== meId` → a second `Alert` reason picker (Spam / Harassment / Inappropriate / Other, mirroring `ParticipantRow.showReportReasons`) → `reportComment.mutate({ reporterId: meId, reportedId: comment.author_id, commentId: comment.id, reason })`; on success `Alert.alert('Report sent', …)`.
  - **Cancel**.
  Wire it to `CommentRow`'s `onRequestDelete` (rename the prop to `onOverflow` for clarity) so the dots show for **any** non-deleted comment (`meId != null`), not just moderatable ones.
- [ ] **Step 2:** Add the `reportComment` mutation (`useMutation` over the service) in the sheet.
- [ ] **Step 3:** typecheck + lint + commit `"feat(community): report or delete a comment from the overflow"`.

> `CommentRow` currently only renders the dots when `canModerate`. Broaden to `!comment.deleted && !!meId` and let the sheet's Alert present only the applicable actions.

---

## Task 9: Verify + manual QA

- [ ] **Step 1:** `npm run typecheck` (0), `npx jest --forceExit` (green, incl. `commentLikes.service` + the new `useComments` like tests), `npm run lint` (no new).
- [ ] **Step 2:** Append a "Phase 2c" block to `docs/superpowers/tests/community-manual-qa.md`:
  - **DB (052–054):** comment like count +1/−1 (floors at 0); coalesced `comment_liked` (2 likers → 1 row, count 2); self-like no notif; RLS (can't like a comment on an unseen post); `liked_by_me` per viewer; a report row with `comment_id` inserts.
  - **Android:** heart on a comment fills instantly + Light haptic + subtle pop + count moves; unlike; persists on reopen; **report** someone else's comment via overflow → reason picker → "Report sent"; **delete** still works for own / post-author; the comment author gets a coalesced "liked your comment" notification (not on self-like).
- [ ] **Step 3:** commit `"docs(community): phase 2c manual QA"`.

---

## Self-Review (against the spec)

- **§9 "each comment likeable":** `comment_likes` + optimistic heart on every row (top-level + reply) ✔; `liked_by_me` from the RPCs ✔.
- **§7/§9 "report on any comment":** `reports.comment_id` + `reportComment` + the overflow Report flow on others' comments, reusing the existing `ReportReason` picker ✔. (Auto-hide at N reports is **Phase 6**, not here.)
- **§10 notifications:** `comment_liked` coalesced via the shared helper; first pushes, bumps silent; never self-notify ✔.
- **Deferred (named):** @mentions → **Phase 2d** (`mentions` column already present).

**Placeholder scan:** SQL + service + factory steps are concrete; the two component tasks (7, 8) describe changes to already-built files against a named reference (`PostActionBar`, `ParticipantRow`) rather than pasting full files, because they extend existing components with one control / one Alert each. The `>` notes are real constraints (immutability pattern, dots-visibility broadening, the COMMENT-keyword splitter trap).

**Type consistency:** `PostComment.liked_by_me` flows RPC → service → `patchCommentLike`/`commentLikeMutations` → `CommentRow`. `likeComment`/`unlikeComment`/`reportComment`/`patchCommentLike`/`commentLikeMutations`/`useToggleCommentLike` names match across definition and use. `parentId` threaded from reply rendering into the like target.
```
