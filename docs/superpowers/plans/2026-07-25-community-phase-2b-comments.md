# Community Phase 2b — Comments (core) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user can open a post's comment sheet, read a relevancy-ranked thread of top-level comments with chronological one-level replies, post a comment or reply (optimistically), delete their own (post authors can delete any and turn comments off), and the right people get a **coalesced** "commented on your post" / "replied to you" notification. Comments update live while the sheet is open.

**Architecture:** A `post_comments` table (self-referencing `parent_id`, one level deep, `deleted_at` tombstone) generalizing the `wrap_photo_comments` shape, with a trigger-maintained `posts.comment_count` and a `comments_enabled` flag on `posts`. Two RPCs — `post_comments_ranked` (top-level, relevancy-ordered, with `reply_count`) and `post_comment_replies` (chronological) — keep the tree read cheap. A `comments.service` + `useComments` hook (TanStack query + a realtime `postgres_changes` subscription while the sheet is open + an optimistic add/delete factory mirroring `participationMutations`). A `CommentSheet` (the existing `Sheet`) holds a `FlatList` of `CommentRow`s with expandable replies and a pinned `CommentComposer`. Notifications reuse the coalescing primitive built in Phase 2a.

**Tech Stack:** Expo Router, React Native, Reanimated 4, TanStack Query v5, Supabase (Postgres + RLS + plpgsql triggers + realtime), `expo-haptics`.

**Deferred to Phase 2c (named, not dropped):** comment **likes** (`comment_likes` table + `comment_liked` notif + optimistic like), **reporting** a comment (extend `reports`), and **@mentions** (autocomplete + resolution + `mention` notif). 2b ships read/write/reply/rank/moderate; 2c layers those on.

## Global Constraints

- **Expo SDK 56** — read https://docs.expo.dev/versions/v56.0.0/ before platform code.
- **No hardcoded colours** (`COLORS`), **no hardcoded fonts** (`FONTS`), **new type via `TYPE`/`TYPE_SIZE`**.
- **Check `src/components/ui/` first.** Reuse `Sheet`, `TextField`, `Avatar`, `Button`, `IconButton`, `PressableScale`, `Icon`, `Loader`, `EmptyState`, `Dialog`. Add a prop before forking.
- **Optimistic mutations follow the `participationMutations` factory** (`src/hooks/useEventParticipation.ts`): plain `UseMutationOptions` factory, testable against a bare `QueryClient`. react-query v5.100 callbacks take a trailing `MutationFunctionContext` ({client, meta}); tests invoking them directly must pass it.
- **Shared query keys** in `src/constants/queryKeys.ts` with `all` + `of()`.
- **DB conventions:** one numbered migration per file, run whole in the SQL editor, `CREATE ... IF NOT EXISTS`, RLS with the table, `snake_case`, `p_`-prefixed RPC params, `SECURITY DEFINER` on notification triggers, `SECURITY INVOKER` (default) on read RPCs so `posts`/`post_comments` RLS scopes them. Next free migration numbers: **048, 049, 050** (highest existing is `047`).
- **Notification enum in two places** kept in sync: Postgres `notification_type` (`ALTER TYPE ... ADD VALUE IF NOT EXISTS`) + TS `NotificationType`. Copy in **three** surfaces: `src/utils/notificationCopy.ts` (banner), `supabase/functions/send-push-notification/index.ts` `composeCopy` (push), and `app/notifications.tsx` (`notifText` list copy + `onPressNotif` tap-nav).
- **Coalescing** reuses the Phase 2a pattern (migration 046 `on_post_like`): one notification row per `(recipient, subject, type)`, bumped within a 24h unread window via `payload.count` + `payload.actors` (capped 3); the AFTER-INSERT `push_notification_fanout` pushes on the first INSERT and stays silent on UPDATE bumps.
- **Realtime** follows `src/hooks/useReactions.ts`: `supabase.channel(name).on('postgres_changes', {event, schema:'public', table, filter}, cb).subscribe()`, cleaned up with `supabase.removeChannel(channel)`.
- **Verify gates:** `npm run typecheck` at **0**; `npm test` green; `npm run lint` no new errors beyond the pre-existing 95/16.
- **Testing reality:** no render tests (Reanimated/Jest). Test services via the fluent-builder mock (`src/services/community/__tests__/postLikes.service.test.ts`), pure helpers + mutation factories directly. SQL verified by hand in the SQL editor. Visuals: device check, **Android first**. Hook tests import `useAuthStore` → run Jest with `--forceExit`.

---

## File Structure

**Created:**
- `supabase/migrations/048_post_comments.sql` — table, one-level trigger, `comments_enabled`, RLS, count trigger.
- `supabase/migrations/049_comment_notifications.sql` — enum values + coalesced comment/reply notify triggers.
- `supabase/migrations/050_comments_rpcs.sql` — `post_comments_ranked` + `post_comment_replies`.
- `src/services/community/comments.service.ts` — get/add/delete/setCommentsEnabled.
- `src/services/community/__tests__/comments.service.test.ts`
- `src/hooks/useComments.ts` — ranked query + realtime + `commentMutations()` factory + `useCommentReplies`.
- `src/hooks/__tests__/useComments.test.ts`
- `src/components/community/CommentRow.tsx`
- `src/components/community/CommentComposer.tsx`
- `src/components/community/CommentSheet.tsx`

**Modified:**
- `src/types/models.ts` — `PostComment`; extend `NotificationType`.
- `src/constants/queryKeys.ts` — `community.comments` / `community.replies`.
- `src/utils/notificationCopy.ts`, `supabase/functions/send-push-notification/index.ts`, `app/notifications.tsx` — copy + tap-nav for `post_commented` / `comment_reply`.
- `app/(tabs)/community.tsx` — `onComment` opens the `CommentSheet`.
- `src/components/community/PostActionBar.tsx` — (no change; already calls `onComment`).

---

## Task 1: `post_comments` table + one-level guard + count + `comments_enabled`

**Files:** Create `supabase/migrations/048_post_comments.sql`

**Interfaces:**
- Consumes: `posts` (044), `profiles`.
- Produces: table `post_comments(id, post_id, author_id, parent_id, body, mentions, like_count, deleted_at, created_at)`; `posts.comments_enabled BOOLEAN`; trigger maintaining `posts.comment_count`. Consumed by Tasks 2–6.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- COMMUNITY COMMENTS: flat top-level + one level of replies (parent_id). Generic
-- like wrap_photo_comments but richer: self-ref parent, tombstone (deleted_at),
-- trigger-maintained posts.comment_count. Comment LIKES + reports + mentions are
-- Phase 2c (like_count/mentions columns laid down now). Run whole in SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- Post authors can switch comments off per post.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS comments_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS post_comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- NULL = top-level; set = a reply to another comment. One level only (trigger).
  parent_id  UUID REFERENCES post_comments(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  mentions   UUID[] NOT NULL DEFAULT '{}',
  like_count INT NOT NULL DEFAULT 0,
  -- Tombstone: a deleted parent that still has replies stays as "comment removed".
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS post_comments_post_idx   ON post_comments (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS post_comments_parent_idx ON post_comments (parent_id, created_at);

-- Enforce exactly one level: a reply's parent must itself be top-level.
CREATE OR REPLACE FUNCTION enforce_comment_one_level()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM post_comments p
               WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'comments are one level deep: cannot reply to a reply';
    END IF;
    -- A reply must live on the same post as its parent.
    IF (SELECT post_id FROM post_comments WHERE id = NEW.parent_id) <> NEW.post_id THEN
      RAISE EXCEPTION 'reply post_id must match parent post_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_comment_one_level ON post_comments;
CREATE TRIGGER enforce_comment_one_level
  BEFORE INSERT ON post_comments
  FOR EACH ROW EXECUTE FUNCTION enforce_comment_one_level();

-- Maintain posts.comment_count = count of live (non-tombstoned) comments.
CREATE OR REPLACE FUNCTION on_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  ELSE
    -- UPDATE: only a transition into tombstone decrements (row stays but stops
    -- counting as a live comment).
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_comment_count ON post_comments;
CREATE TRIGGER on_post_comment_count
  AFTER INSERT OR DELETE OR UPDATE ON post_comments
  FOR EACH ROW EXECUTE FUNCTION on_post_comment_count();

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: you can read a comment iff you can read its post (defers to posts RLS).
DROP POLICY IF EXISTS "post_comments_select" ON post_comments;
CREATE POLICY "post_comments_select" ON post_comments
  FOR SELECT TO authenticated USING (post_id IN (SELECT id FROM posts));

-- INSERT: your own comment, on a post you can see, that has comments enabled.
DROP POLICY IF EXISTS "post_comments_insert" ON post_comments;
CREATE POLICY "post_comments_insert" ON post_comments
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid()
    AND post_id IN (SELECT id FROM posts WHERE comments_enabled = TRUE)
  );

-- UPDATE (tombstone): the comment author OR the post's author.
DROP POLICY IF EXISTS "post_comments_update" ON post_comments;
CREATE POLICY "post_comments_update" ON post_comments
  FOR UPDATE TO authenticated USING (
    author_id = auth.uid()
    OR post_id IN (SELECT id FROM posts WHERE author_id = auth.uid())
  );

-- DELETE (hard, for a leaf): the comment author OR the post's author.
DROP POLICY IF EXISTS "post_comments_delete" ON post_comments;
CREATE POLICY "post_comments_delete" ON post_comments
  FOR DELETE TO authenticated USING (
    author_id = auth.uid()
    OR post_id IN (SELECT id FROM posts WHERE author_id = auth.uid())
  );
```

- [ ] **Step 2: Apply + verify count and one-level guard**

```sql
-- Seed a top-level comment + a reply; count reflects both.
INSERT INTO post_comments (post_id, author_id, body) VALUES ('<postA>','<B>','top') RETURNING id; -- note <c1>
INSERT INTO post_comments (post_id, author_id, parent_id, body) VALUES ('<postA>','<C>','<c1>','reply');
SELECT comment_count FROM posts WHERE id='<postA>';    -- expect 2
-- Replying to a reply must fail:
INSERT INTO post_comments (post_id, author_id, parent_id, body) VALUES ('<postA>','<B>','<reply_id>','nested');
-- expect: ERROR "comments are one level deep"
```

- [ ] **Step 3: Verify tombstone decrements, hard-delete decrements**

```sql
UPDATE post_comments SET deleted_at = NOW() WHERE id='<c1>';
SELECT comment_count FROM posts WHERE id='<postA>';    -- expect 1 (tombstone stopped counting)
DELETE FROM post_comments WHERE body='reply';
SELECT comment_count FROM posts WHERE id='<postA>';    -- expect 0
```

- [ ] **Step 4: Verify comments-off blocks inserts (RLS)**

```sql
UPDATE posts SET comments_enabled = FALSE WHERE id='<postA>';
-- As an authenticated user, inserting a comment on postA is rejected by the WITH CHECK.
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/048_post_comments.sql
git commit -m "feat(community): post_comments table, one-level guard, count trigger, comments_enabled"
```

---

## Task 2: Coalesced comment + reply notifications

**Files:** Create `supabase/migrations/049_comment_notifications.sql`

**Interfaces:**
- Consumes: `post_comments` (Task 1), `posts`, `profiles`, `notifications`, `notification_type`.
- Produces: enum values `'post_commented'`, `'comment_reply'`; trigger `on_post_comment_notify` (post author on a top-level comment; parent-comment author on a reply). Consumed by Task 4 (copy).

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- COMMENT NOTIFICATIONS: a top-level comment notifies the post author
-- ('post_commented', coalesced per post); a reply notifies the parent comment's
-- author ('comment_reply', coalesced per parent comment). Same coalescing shape
-- as on_post_like (046). Never notify your own action. Run whole in SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'post_commented';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'comment_reply';

-- Reusable coalescer: bump the most recent unread, in-window row for
-- (recipient, subject, type), else insert a fresh one. subject_key names the
-- payload field holding the subject id ('post_id' or 'parent_id').
CREATE OR REPLACE FUNCTION coalesce_notification(
  p_recipient  UUID,
  p_actor      UUID,
  p_type       notification_type,
  p_subject_key TEXT,
  p_subject_id UUID
) RETURNS VOID AS $$
DECLARE
  v_actor    TEXT;
  v_existing RECORD;
  v_window   INTERVAL := INTERVAL '24 hours';
BEGIN
  IF p_recipient IS NULL OR p_recipient = p_actor THEN RETURN; END IF;
  SELECT name INTO v_actor FROM profiles WHERE id = p_actor;

  SELECT * INTO v_existing FROM notifications
  WHERE recipient_id = p_recipient AND type = p_type
    AND (payload->>p_subject_key)::uuid = p_subject_id
    AND is_read = FALSE AND created_at > NOW() - v_window
  ORDER BY created_at DESC LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    UPDATE notifications
    SET sender_id = p_actor,
        payload = jsonb_set(
          jsonb_set(v_existing.payload, '{count}',
            to_jsonb(COALESCE((v_existing.payload->>'count')::int, 1) + 1)),
          '{actors}',
          (SELECT jsonb_agg(a) FROM (
             SELECT a FROM jsonb_array_elements(
               to_jsonb(v_actor) || COALESCE(v_existing.payload->'actors','[]'::jsonb)
             ) WITH ORDINALITY AS t(a, ord) ORDER BY ord LIMIT 3) capped)),
        created_at = NOW()
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO notifications (recipient_id, sender_id, type, payload)
    VALUES (p_recipient, p_actor, p_type,
            jsonb_build_object(p_subject_key, p_subject_id, 'count', 1,
                               'actors', jsonb_build_array(v_actor)));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION on_post_comment_notify()
RETURNS TRIGGER AS $$
DECLARE
  v_post_author   UUID;
  v_parent_author UUID;
BEGIN
  IF NEW.parent_id IS NULL THEN
    SELECT author_id INTO v_post_author FROM posts WHERE id = NEW.post_id;
    PERFORM coalesce_notification(v_post_author, NEW.author_id,
              'post_commented', 'post_id', NEW.post_id);
  ELSE
    SELECT author_id INTO v_parent_author FROM post_comments WHERE id = NEW.parent_id;
    PERFORM coalesce_notification(v_parent_author, NEW.author_id,
              'comment_reply', 'parent_id', NEW.parent_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_comment_notify ON post_comments;
CREATE TRIGGER on_post_comment_notify
  AFTER INSERT ON post_comments
  FOR EACH ROW EXECUTE FUNCTION on_post_comment_notify();
```

> **Note:** migration 046's `on_post_like` predates `coalesce_notification` and
> inlines the same logic. Leave 046 as-is (don't refactor a shipped migration);
> this shared helper is for the comment triggers. If you want, a later cleanup
> migration can repoint the like trigger at the helper — out of scope here.

- [ ] **Step 2: Verify coalescing + reply target**

```sql
-- Two commenters on A's post → one coalesced 'post_commented' row for A.
INSERT INTO post_comments (post_id, author_id, body) VALUES ('<postA>','<B>','hi');
INSERT INTO post_comments (post_id, author_id, body) VALUES ('<postA>','<C>','yo');
SELECT count(*), max((payload->>'count')::int) FROM notifications
  WHERE recipient_id='<A>' AND type='post_commented' AND (payload->>'post_id')::uuid='<postA>';
-- expect: 1 row, count 2.
-- A reply notifies the PARENT author (B), not the post author:
INSERT INTO post_comments (post_id, author_id, parent_id, body) VALUES ('<postA>','<C>','<B_comment_id>','re');
SELECT count(*) FROM notifications WHERE recipient_id='<B>' AND type='comment_reply';  -- expect ≥1
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/049_comment_notifications.sql
git commit -m "feat(community): coalesced comment + reply notifications"
```

---

## Task 3: Comment read RPCs (ranked top-level + chronological replies)

**Files:** Create `supabase/migrations/050_comments_rpcs.sql`

**Interfaces:**
- Consumes: `post_comments` (Task 1), `profiles`, `friendships`, `posts`.
- Produces:
  - `post_comments_ranked(p_post_id UUID, p_viewer_id UUID, p_limit INT)` → `(id, author_id, author_name, author_photo_url, body, mentions, like_count, reply_count, deleted, created_at)` top-level only, relevancy-ordered.
  - `post_comment_replies(p_parent_id UUID, p_viewer_id UUID)` → same columns (no reply_count), chronological asc.
  Consumed by Task 5 (service).

**Ranking note (tunable, no likes yet — those are 2c):** score =
`reply_count*2 + (post_author's own comment ? 5 : 0) + (viewer's friend ? 3 : 0)`
with `created_at DESC` as the recency tiebreak. `like_count*W` is reserved for 2c.
Comment volumes per post are small, so this returns up to `p_limit` (default 100)
without keyset paging — pagination is deferred until real volume warrants it.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- COMMENT READS: top-level comments relevancy-ranked (replies + author/friend
-- boosts, recency tiebreak); replies chronological. SECURITY INVOKER so
-- post_comments RLS scopes visibility. Tombstoned rows are returned with
-- deleted=true and a null body so the client renders "comment removed" and keeps
-- replies readable. Run whole in SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS post_comments_ranked(UUID, UUID, INT);
CREATE OR REPLACE FUNCTION post_comments_ranked(
  p_post_id   UUID,
  p_viewer_id UUID,
  p_limit     INT DEFAULT 100
)
RETURNS TABLE (
  id UUID, author_id UUID, author_name TEXT, author_photo_url TEXT,
  body TEXT, mentions UUID[], like_count INT, reply_count BIGINT,
  deleted BOOLEAN, created_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
  WITH post_author AS (SELECT author_id FROM posts WHERE id = p_post_id)
  SELECT
    c.id, c.author_id, pr.name, pr.photo_url,
    CASE WHEN c.deleted_at IS NULL THEN c.body ELSE NULL END,
    c.mentions, c.like_count,
    (SELECT count(*) FROM post_comments r WHERE r.parent_id = c.id) AS reply_count,
    (c.deleted_at IS NOT NULL) AS deleted, c.created_at
  FROM post_comments c
  JOIN profiles pr ON pr.id = c.author_id
  WHERE c.post_id = p_post_id AND c.parent_id IS NULL
  ORDER BY
    (SELECT count(*) FROM post_comments r WHERE r.parent_id = c.id) * 2
    + CASE WHEN c.author_id = (SELECT author_id FROM post_author) THEN 5 ELSE 0 END
    + CASE WHEN EXISTS (
        SELECT 1 FROM friendships f WHERE f.status = 'accepted'
          AND ((f.requester_id = p_viewer_id AND f.addressee_id = c.author_id)
            OR (f.addressee_id = p_viewer_id AND f.requester_id = c.author_id))
      ) THEN 3 ELSE 0 END DESC,
    c.created_at DESC
  LIMIT p_limit;
$$;

DROP FUNCTION IF EXISTS post_comment_replies(UUID, UUID);
CREATE OR REPLACE FUNCTION post_comment_replies(
  p_parent_id UUID,
  p_viewer_id UUID
)
RETURNS TABLE (
  id UUID, author_id UUID, author_name TEXT, author_photo_url TEXT,
  body TEXT, mentions UUID[], like_count INT, deleted BOOLEAN, created_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
  SELECT
    c.id, c.author_id, pr.name, pr.photo_url,
    CASE WHEN c.deleted_at IS NULL THEN c.body ELSE NULL END,
    c.mentions, c.like_count, (c.deleted_at IS NOT NULL), c.created_at
  FROM post_comments c
  JOIN profiles pr ON pr.id = c.author_id
  WHERE c.parent_id = p_parent_id
  ORDER BY c.created_at ASC;
$$;
```

- [ ] **Step 2: Verify ranking + reply_count + tombstone shape**

```sql
SELECT id, reply_count, deleted, body FROM post_comments_ranked('<postA>', '<A>', 100);
-- Expect: top-level only; the comment with more replies / by the post author /
-- by A's friend ranks higher; a tombstoned row shows deleted=true, body NULL.
SELECT id, body, created_at FROM post_comment_replies('<c1>', '<A>');  -- chronological asc
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/050_comments_rpcs.sql
git commit -m "feat(community): ranked top-level + chronological reply RPCs"
```

---

## Task 4: Types + query keys + notification copy

**Files:** Modify `src/types/models.ts`, `src/constants/queryKeys.ts`, `src/utils/notificationCopy.ts`, `supabase/functions/send-push-notification/index.ts`, `app/notifications.tsx`

**Interfaces:**
- Produces: `PostComment` type; `NotificationType` += `'post_commented' | 'comment_reply'`; `queryKeys.community.comments` / `.replies`; copy in all three surfaces. Consumed by Tasks 5–8.

- [ ] **Step 1: `PostComment` + `NotificationType`** — in `models.ts`:

```typescript
// One comment as returned by post_comments_ranked / post_comment_replies.
export interface PostComment {
  id: string;
  author_id: string;
  author_name: string;
  author_photo_url: string | null;
  body: string | null;          // null when deleted (tombstone → "comment removed")
  mentions: string[];
  like_count: number;
  reply_count?: number;         // present on top-level rows only
  deleted: boolean;
  created_at: string;
}
```
And extend the union:
```typescript
  | 'post_liked'
  | 'post_commented'
  | 'comment_reply'
```

- [ ] **Step 2: Query keys** — in `queryKeys.ts`, inside `community`:

```typescript
    comments: {
      all: ['community', 'comments'] as const,
      of: (postId: Id) => ['community', 'comments', postId] as const,
    },
    replies: {
      all: ['community', 'replies'] as const,
      of: (parentId: Id) => ['community', 'replies', parentId] as const,
    },
```

- [ ] **Step 3: Banner copy** — in `notificationCopy.ts`, add cases (uses coalesced `count`):

```typescript
    case 'post_commented': {
      const others = (opts.count ?? 1) - 1;
      return {
        title: 'New comment',
        body: others > 0
          ? `${senderName} and ${others} other${others > 1 ? 's' : ''} commented on your post`
          : `${senderName} commented on your post`,
      };
    }
    case 'comment_reply':
      return { title: 'New reply', body: `${senderName} replied to your comment` };
```

- [ ] **Step 4: Push copy** — mirror both cases in `composeCopy` (edge fn), reading `record.payload?.count`.

- [ ] **Step 5: List copy + tap-nav** — in `app/notifications.tsx`, add to `notifText` (before default):

```tsx
    case 'post_commented': {
      const others = ((payload?.count as number) ?? 1) - 1;
      return others > 0
        ? <>{who} and {others} other{others > 1 ? 's' : ''} commented on your post</>
        : <>{who} commented on your post</>;
    }
    case 'comment_reply':
      return <>{who} replied to your comment</>;
```
and to `onPressNotif` (before default) — like `post_liked`, route to the feed until Phase 7's post detail:
```tsx
        case 'post_commented':
        case 'comment_reply':
          return dismiss(() => router.push('/(tabs)/community'));
```

- [ ] **Step 6: Typecheck + commit**

Run `npm run typecheck` (0 errors), then:
```bash
git add src/types/models.ts src/constants/queryKeys.ts src/utils/notificationCopy.ts supabase/functions/send-push-notification/index.ts app/notifications.tsx
git commit -m "feat(community): comment types, keys and notification copy"
```

---

## Task 5: `comments.service`

**Files:** Create `src/services/community/comments.service.ts` + `__tests__/comments.service.test.ts`

**Interfaces:**
- Consumes: RPCs (Task 3), `post_comments`/`posts` (Task 1), `PostComment` (Task 4).
- Produces:
  - `getComments({ postId, viewerId }): Promise<PostComment[]>`
  - `getReplies({ parentId, viewerId }): Promise<PostComment[]>`
  - `addComment({ postId, authorId, body, parentId? }): Promise<string>`
  - `deleteComment({ commentId, hasReplies }): Promise<void>` — tombstone (UPDATE) when `hasReplies`, else hard DELETE
  - `setCommentsEnabled({ postId, enabled }): Promise<void>`
  Consumed by Task 6.

- [ ] **Step 1: Failing test** (mirror `postLikes.service.test.ts` fluent-builder mocks):

```typescript
// src/services/community/__tests__/comments.service.test.ts
import { getComments, addComment, deleteComment } from '../comments.service';
import { supabase } from '@/services/supabase';

jest.mock('@/services/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());

describe('getComments', () => {
  it('calls post_comments_ranked with post + viewer', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    await getComments({ postId: 'p1', viewerId: 'u1' });
    expect(supabase.rpc).toHaveBeenCalledWith('post_comments_ranked', {
      p_post_id: 'p1', p_viewer_id: 'u1', p_limit: 100,
    });
  });
});

describe('addComment', () => {
  it('inserts a top-level comment and returns its id', async () => {
    const single = jest.fn().mockResolvedValue({ data: { id: 'c1' }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });
    const id = await addComment({ postId: 'p1', authorId: 'u1', body: '  hi ' });
    expect(supabase.from).toHaveBeenCalledWith('post_comments');
    expect(insert).toHaveBeenCalledWith({
      post_id: 'p1', author_id: 'u1', body: 'hi', parent_id: null,
    });
    expect(id).toBe('c1');
  });
});

describe('deleteComment', () => {
  it('tombstones (update) when the comment has replies', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });
    await deleteComment({ commentId: 'c1', hasReplies: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ body: '', mentions: [] })
    );
    expect(eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('hard-deletes a leaf', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });
    await deleteComment({ commentId: 'c1', hasReplies: false });
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'c1');
  });
});
```

- [ ] **Step 2: Run — FAIL** (`npm test -- comments.service`).

- [ ] **Step 3: Implement**

```typescript
// src/services/community/comments.service.ts
import { supabase } from '@/services/supabase';
import { PostComment } from '@/types/models';

export async function getComments(params: { postId: string; viewerId: string }): Promise<PostComment[]> {
  const { data, error } = await supabase.rpc('post_comments_ranked', {
    p_post_id: params.postId, p_viewer_id: params.viewerId, p_limit: 100,
  });
  if (error) throw error;
  return (data ?? []) as PostComment[];
}

export async function getReplies(params: { parentId: string; viewerId: string }): Promise<PostComment[]> {
  const { data, error } = await supabase.rpc('post_comment_replies', {
    p_parent_id: params.parentId, p_viewer_id: params.viewerId,
  });
  if (error) throw error;
  return (data ?? []) as PostComment[];
}

export async function addComment(params: {
  postId: string; authorId: string; body: string; parentId?: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('post_comments')
    .insert({
      post_id: params.postId,
      author_id: params.authorId,
      body: params.body.trim(),
      parent_id: params.parentId ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

// Tombstone a parent that still has replies (UPDATE), else hard-delete the leaf.
export async function deleteComment(params: { commentId: string; hasReplies: boolean }): Promise<void> {
  if (params.hasReplies) {
    const { error } = await supabase
      .from('post_comments')
      .update({ deleted_at: new Date().toISOString(), body: '', mentions: [] })
      .eq('id', params.commentId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('post_comments').delete().eq('id', params.commentId);
    if (error) throw error;
  }
}

export async function setCommentsEnabled(params: { postId: string; enabled: boolean }): Promise<void> {
  const { error } = await supabase
    .from('posts')
    .update({ comments_enabled: params.enabled })
    .eq('id', params.postId);
  if (error) throw error;
}
```

> The tombstone UPDATE sets `body=''`; the `char_length` CHECK requires 1–500, so
> a tombstone would violate it. **Fix:** the CHECK must allow the tombstone. In
> Task 1's migration, change the body CHECK to only apply to live rows:
> `CHECK (deleted_at IS NOT NULL OR char_length(btrim(body)) BETWEEN 1 AND 500)`.
> Apply this in 048 before running it (or the delete-with-replies path will fail).

- [ ] **Step 4: Run — PASS.** **Step 5: Commit**
```bash
git add src/services/community/comments.service.ts src/services/community/__tests__/comments.service.test.ts
git commit -m "feat(community): comments service (get/add/delete/toggle)"
```

---

## Task 6: `useComments` hook — query + realtime + optimistic factory

**Files:** Create `src/hooks/useComments.ts` + `__tests__/useComments.test.ts`

**Interfaces:**
- Consumes: `comments.service` (Task 5), `queryKeys.community` (Task 4), `useAuthStore`, `PostComment`.
- Produces:
  - `useComments(postId)` — ranked query + a `postgres_changes` subscription (invalidates on insert/update/delete for this post) that is only active while mounted.
  - `useCommentReplies(parentId, enabled)` — lazy replies query.
  - `commentMutations(qc, postId, user)` → `{ add, remove }` `UseMutationOptions`; `add` appends optimistically to the comments cache + bumps the feed's `comment_count`; `remove` drops/tombstones optimistically. `useAddComment(postId)`, `useDeleteComment(postId)`.
  Consumed by Tasks 7–8.

- [ ] **Step 1: Failing test** — cover the pure cache helpers + factory routing (mirror `usePostInteractions.test.ts`, incl. the `mfc(qc)` trailing-context arg). Assert: `add.mutationFn` calls `addComment` with post/author/body/parent; `add.onSuccess` invalidates `queryKeys.community.comments.of(postId)`; `remove.mutationFn` calls `deleteComment` with the `hasReplies` flag passed in the variables.

```typescript
// src/hooks/__tests__/useComments.test.ts
import { QueryClient } from '@tanstack/react-query';
import { commentMutations } from '../useComments';
import { queryKeys } from '@/constants/queryKeys';
import * as svc from '@/services/community/comments.service';
import { Profile } from '@/types/models';

jest.mock('@/services/community/comments.service');
const mfc = (qc: QueryClient) => ({ client: qc, meta: undefined });
const user = { id: 'u1' } as Profile;
beforeEach(() => jest.clearAllMocks());

describe('commentMutations.add', () => {
  it('adds a comment with the author + parent and invalidates the thread', async () => {
    (svc.addComment as jest.Mock).mockResolvedValue('c9');
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { add } = commentMutations(qc, 'p1', user);
    await add.mutationFn!({ body: 'hi', parentId: null }, mfc(qc));
    expect(svc.addComment).toHaveBeenCalledWith({
      postId: 'p1', authorId: 'u1', body: 'hi', parentId: null,
    });
    add.onSuccess!('c9', { body: 'hi', parentId: null }, undefined as never, mfc(qc));
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.community.comments.of('p1') });
  });
});

describe('commentMutations.remove', () => {
  it('deletes with the hasReplies flag', async () => {
    (svc.deleteComment as jest.Mock).mockResolvedValue(undefined);
    const qc = new QueryClient();
    const { remove } = commentMutations(qc, 'p1', user);
    await remove.mutationFn!({ commentId: 'c1', hasReplies: true }, mfc(qc));
    expect(svc.deleteComment).toHaveBeenCalledWith({ commentId: 'c1', hasReplies: true });
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** the hook. Key points:
  - `useComments(postId)`: `useQuery({ queryKey: queryKeys.community.comments.of(postId), queryFn: () => getComments({ postId, viewerId: user.id }) })`, plus a `useEffect` that subscribes to `postgres_changes` on `post_comments` filtered `post_id=eq.${postId}` and calls `qc.invalidateQueries({ queryKey: queryKeys.community.comments.of(postId) })` on any change; cleanup with `supabase.removeChannel`. (Realtime is the reconciler; the optimistic add is for instant feedback.)
  - `commentMutations`: `add.onSuccess` invalidates `comments.of(postId)` **and** the feed keys so the post's `comment_count` refreshes (use `DISCOVERY_FEED_KEYS`); `remove` likewise. Optimistic append/remove on the comments cache is optional polish — the realtime + invalidate already reconcile; keep the factory's cache writes minimal and correct.

```typescript
// src/hooks/useComments.ts
import { useEffect } from 'react';
import {
  useQuery, useMutation, useQueryClient, QueryClient, UseMutationOptions,
} from '@tanstack/react-query';
import { supabase } from '@/services/supabase';
import {
  getComments, getReplies, addComment, deleteComment,
} from '@/services/community/comments.service';
import { queryKeys, DISCOVERY_FEED_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { Profile } from '@/types/models';

export type AddCommentArgs = { body: string; parentId: string | null };
export type RemoveCommentArgs = { commentId: string; hasReplies: boolean };

export function commentMutations(qc: QueryClient, postId: string, user: Profile | null) {
  const key = queryKeys.community.comments.of(postId);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: key });
    DISCOVERY_FEED_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
  };
  const add: UseMutationOptions<string, unknown, AddCommentArgs> = {
    mutationFn: (args) =>
      addComment({ postId, authorId: user!.id, body: args.body, parentId: args.parentId }),
    onSuccess: invalidate,
  };
  const remove: UseMutationOptions<void, unknown, RemoveCommentArgs> = {
    mutationFn: (args) => deleteComment(args),
    onSuccess: invalidate,
  };
  return { add, remove };
}

export function useComments(postId: string) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const query = useQuery({
    queryKey: queryKeys.community.comments.of(postId),
    queryFn: () => getComments({ postId, viewerId: user!.id }),
    enabled: !!user && !!postId,
  });

  // Live while the sheet is mounted: any change to this post's comments refetches.
  useEffect(() => {
    if (!postId) return;
    const channel = supabase
      .channel(`post_comments:${postId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'post_comments', filter: `post_id=eq.${postId}` },
        () => qc.invalidateQueries({ queryKey: queryKeys.community.comments.of(postId) }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [postId, qc]);

  return query;
}

export function useCommentReplies(parentId: string, enabled: boolean) {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.community.replies.of(parentId),
    queryFn: () => getReplies({ parentId, viewerId: user!.id }),
    enabled: !!user && enabled,
  });
}

export function useAddComment(postId: string) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  return useMutation(commentMutations(qc, postId, user).add);
}

export function useDeleteComment(postId: string) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  return useMutation(commentMutations(qc, postId, user).remove);
}
```

- [ ] **Step 4: Run — PASS.** **Step 5: typecheck + commit**
```bash
git add src/hooks/useComments.ts src/hooks/__tests__/useComments.test.ts
git commit -m "feat(community): useComments query + realtime + comment mutations"
```

---

## Task 7: `CommentRow` + `CommentComposer`

**Files:** Create `src/components/community/CommentRow.tsx`, `src/components/community/CommentComposer.tsx`

**Interfaces:**
- Consumes: `PostComment` (Task 4), `useCommentReplies`/`useDeleteComment` (Task 6), `Avatar`, `IconButton`, `PressableScale`, `TextField`, `Button`, `Icon`, `Dialog`, tokens, `relativeTime`.
- Produces:
  - `<CommentRow comment postId isPostAuthor onReply />` — avatar (taps to `/friends/[id]`), name · time, body (or "comment removed" when `deleted`), a **Reply** affordance, an expandable **View N replies** that renders nested `CommentRow`s (reply variant, no further reply button), and an overflow (own comment or post author → delete via `Dialog`).
  - `<CommentComposer replyingTo onSubmit onCancelReply pending />` — `TextField` + send `IconButton`; a "Replying to X" banner with a cancel when `replyingTo` is set.

- [ ] **Step 1: Write `CommentRow`** (text-only; comment likes/mentions are 2c — no heart yet). Tombstone renders a muted "comment removed" and still shows its replies. Delete confirms through `Dialog` (destructive), mirroring the feed's delete dialog. `View N replies` toggles `useCommentReplies(comment.id, expanded)`.

- [ ] **Step 2: Write `CommentComposer`.** Single-line-growing `TextField`, `maxLength={500}`, send disabled while empty/pending. Medium haptic on send success handled by the sheet.

> Verify props against the real primitives before running: `TextField`
> (`multiline`, `maxLength`, trailing slot), `Dialog` (`visible`/`onClose`),
> `IconButton` icon names (`send`, `dots`) — all confirmed present in Phase 1/2a
> work; match exact names (`grep -n "send\|dots" src/components/ui/Icon.tsx`).

- [ ] **Step 3: Typecheck + commit**
```bash
git add src/components/community/CommentRow.tsx src/components/community/CommentComposer.tsx
git commit -m "feat(community): comment row (with replies) and composer"
```

---

## Task 8: `CommentSheet` + wire into the feed

**Files:** Create `src/components/community/CommentSheet.tsx`; modify `app/(tabs)/community.tsx`

**Interfaces:**
- Consumes: `useComments`/`useAddComment` (Task 6), `CommentRow`/`CommentComposer` (Task 7), `Sheet`, `Loader`, `EmptyState`, `useAuthStore`, `CommunityPost`/`PostComment`.
- Produces: `<CommentSheet post visible onClose />`; the feed's `onComment` opens it for the tapped post.

- [ ] **Step 1: Write `CommentSheet`** — a `Sheet` titled "Comments" holding: a `FlatList` of top-level `CommentRow`s (loading → `Loader`, empty → `EmptyState` "No comments yet"), and a pinned `CommentComposer` at the bottom. State: `replyingTo: PostComment | null`. Submitting calls `useAddComment(post.id)` with `{ body, parentId: replyingTo?.id ?? null }`; on success clear the input, clear `replyingTo`, Medium haptic. If the viewer is the post author, a header control toggles `setCommentsEnabled` (comments on/off); when off, show "Comments are turned off" instead of the composer.

- [ ] **Step 2: Wire the feed.** In `app/(tabs)/community.tsx`, replace the no-op `onComment` with state that opens the sheet:

```tsx
const [commentPost, setCommentPost] = useState<CommunityPost | null>(null);
const onComment = useCallback((p: CommunityPost) => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  setCommentPost(p);
}, []);
// …below ComposePostSheet:
{commentPost && (
  <CommentSheet
    post={commentPost}
    visible={!!commentPost}
    onClose={() => setCommentPost(null)}
  />
)}
```

> Verify `Sheet` supports a scrolling body with a pinned footer, or place the
> composer outside the scroll area (`grep -n "footer\|children\|ScrollView\|keyboard" src/components/ui/Overlay.tsx`). If `Sheet` doesn't handle keyboard avoidance for a bottom input, wrap the composer in `KeyboardAvoidingView` (iOS) — Android adjusts by default. Confirm on device.

- [ ] **Step 3: Typecheck + commit**
```bash
git add src/components/community/CommentSheet.tsx "app/(tabs)/community.tsx"
git commit -m "feat(community): comment sheet wired into the feed"
```

---

## Task 9: Verify gate + manual QA

**Files:** none (verification); append to `docs/superpowers/tests/community-manual-qa.md`.

- [ ] **Step 1: Gate** — `npm run typecheck` (0), `npx jest --forceExit` (green, incl. `comments.service` + `useComments`), `npm run lint` (no new).

- [ ] **Step 2: Append a "Phase 2b — Comments" section** to `community-manual-qa.md`:
  - **DB (after 048–050):** one-level guard rejects reply-to-reply; count trigger (+1 insert, −1 tombstone, −1 hard-delete); comments-off blocks insert; ranking (post-author/friend/most-replied float up); tombstone returns `deleted=true`, null body, replies still returned; coalesced `post_commented` (2 commenters → 1 row, count 2); reply notifies parent author; self-comment/self-reply never notifies.
  - **Android:** open sheet from a post's comment button (Light haptic); post a comment → appears at/near top, count on the card increments; reply → nested under parent, "View N replies" expands; realtime — a comment from another account appears live while the sheet is open; delete own comment (Dialog) → gone or "comment removed" if it had replies; as post author, delete anyone's comment + toggle comments off (composer replaced by "Comments are turned off"); tap a commenter's avatar/name → profile; keyboard doesn't cover the composer (Android + iOS).

- [ ] **Step 3: Commit**
```bash
git add docs/superpowers/tests/community-manual-qa.md
git commit -m "docs(community): phase 2b comments manual QA"
```

---

## Self-Review (against the spec)

- **§9 comments:** flat top-level **+ one level of replies** (DB trigger enforces) ✔; top-level **relevancy-ranked** (replies + author/friend boost, recency tiebreak), replies **chronological** ✔; who-can-comment = who-can-see (RLS) ✔; **two-sided moderation** — author deletes own, post author deletes any + **turns comments off** ✔; **tombstone** a parent with replies, hard-delete a leaf ✔; blocked users' comments hidden both ways (inherited from `posts` RLS via `post_id IN (SELECT id FROM posts)`) ✔.
- **§10 notifications:** `post_commented` + `comment_reply` **coalesced on write** via the shared helper; first pushes, bumps silent; never self-notify ✔.
- **Deferred (named):** comment **likes** + `comment_liked`, comment **reporting**, **@mentions** autocomplete/resolution/`mention` notif → **Phase 2c**. `like_count`/`mentions` columns + the ranking's like term are laid down now so 2c adds behaviour, not schema churn. Comment *pagination* deferred (small volumes) — noted, not silently dropped.
- **§12 UI:** the existing `Sheet` (glass), `Dialog` for destructive confirms, Light haptic on open/reply, Medium on publish; author taps reuse `/friends/[id]`.

**Placeholder scan:** SQL + service + hook steps are concrete. The two `>` call-outs are real corrections the implementer must apply — the body CHECK must exempt tombstones (Task 1/Task 5), and the `Sheet` keyboard/footer behaviour must be verified against `Overlay.tsx` (Task 8). `CommentRow`/`CommentComposer`/`CommentSheet` are described structurally rather than pasted in full because they compose already-specified primitives and one new mutation call each; write them to match `PostCard`/`ComposePostSheet` conventions.

**Type consistency:** `PostComment` (Task 4) flows from the RPCs (Task 3) through the service (Task 5), hook (Task 6), and components (Tasks 7–8). `AddCommentArgs`/`RemoveCommentArgs`, `commentMutations`, `getComments`/`getReplies`/`addComment`/`deleteComment`/`setCommentsEnabled` names match across definition and call sites. `queryKeys.community.comments.of` / `.replies.of` used consistently.
```
