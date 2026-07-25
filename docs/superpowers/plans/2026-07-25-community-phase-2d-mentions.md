# Community Phase 2d — @mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: executing-plans. Steps use `- [ ]`.

**Goal:** Let people @mention others in comments/replies — autocomplete while
typing, tappable highlighted handles in rendered bodies, and a
"[user] mentioned you in a comment" notification — reusing the chat mention
primitives verbatim.

**Architecture:** Mirror chat. Parsing + notification are **server-side** (a
`BEFORE INSERT` trigger resolves `@username` tokens in the body into
`post_comments.mentions UUID[]`; the existing `AFTER INSERT` notify trigger fans
out a non-coalesced `comment_mention` per resolved id, with mention *beating*
reply/comment for a recipient who is both). The client reuses
`MentionText` / `MentionAutocomplete` / `activeMentionQuery` / `insertMention`
from `src/components/chat/` (import, do **not** fork — they're generic; a future
cleanup may promote them to `ui/`). The reply prefill switches from the display
name to the lowercase `author_username`.

**Tech Stack:** Supabase plpgsql, TanStack Query v5, Reanimated 4, expo-router.

## Global Constraints
- Never hardcode a colour/font — `COLORS` / `FONTS` / `TYPE_SIZE`.
- `notification_type` lives in **two** places (PG enum + TS union); copy in
  **three** surfaces (`notificationCopy.ts`, `send-push-notification` `composeCopy`,
  `app/notifications.tsx` `notifText` + `onPressNotif`).
- Usernames are lowercase `^[a-z0-9._]{3,30}$` (migration 029). Mention tokens
  render/prefill lowercase; resolution is case-insensitive.
- Don't fork a primitive — reuse `chat/` mention pieces.

---

### Task 1: Migration 055 — RPC username, resolve trigger, comment_mention notify

**Files:**
- Create: `supabase/migrations/055_comment_mentions.sql`

**Interfaces:**
- Produces: `post_comments_ranked` / `post_comment_replies` now also return
  `author_username TEXT`; `notification_type` gains `comment_mention`;
  `post_comments.mentions` is auto-populated from the body.

Design notes baked in:
- **Resolution scope:** any `@username` matching a real profile resolves
  (excluding self). No friend/visibility gate for MVP — the autocomplete steers
  users to relevant people; tighten later if spammed. Documented in the header.
- **Precedence:** a recipient in `NEW.mentions` gets **only** `comment_mention`
  for this comment; the `post_commented` / `comment_reply` they'd otherwise get
  is suppressed (mention is the higher-signal event — same rule chat uses).
- **Not coalesced:** one `comment_mention` row per comment (mentions are
  personal; "X and 2 others mentioned you" reads wrong). payload carries
  `{ post_id, comment_id }` for tap-nav.
- Both RPCs change return type → `DROP` then recreate (SECURITY INVOKER, as 053).
- Header must NOT start a line with the `COMMENT` keyword (Supabase editor
  splitter tokenizes before stripping `--`; bit us on 049/050).

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- MENTIONS in comments. A BEFORE trigger resolves @username tokens in the body
-- into post_comments.mentions (any real profile, excluding self — the composer
-- steers who; no visibility gate for MVP). The AFTER-INSERT notify trigger fans
-- out a non-coalesced 'comment_mention' per mentioned id and SUPPRESSES the
-- post_commented/comment_reply that recipient would otherwise get (mention wins,
-- like chat). Both read RPCs also return author_username. Run whole in SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'comment_mention';

-- Resolve @username → profile ids into NEW.mentions on write. Tombstone UPDATEs
-- (deleted_at set, body blanked) resolve to '{}' naturally. Excludes the author.
CREATE OR REPLACE FUNCTION resolve_comment_mentions()
RETURNS TRIGGER AS $$
BEGIN
  NEW.mentions := COALESCE((
    SELECT array_agg(DISTINCT p.id)
    FROM (
      SELECT DISTINCT lower(m[1]) AS uname
      FROM regexp_matches(NEW.body, '@([a-zA-Z0-9._]+)', 'g') m
    ) t
    JOIN profiles p ON lower(p.username) = t.uname
    WHERE p.id <> NEW.author_id
  ), '{}');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS resolve_comment_mentions ON post_comments;
CREATE TRIGGER resolve_comment_mentions
  BEFORE INSERT OR UPDATE OF body ON post_comments
  FOR EACH ROW EXECUTE FUNCTION resolve_comment_mentions();

-- Notify: mentions first (each mentioned id, excluding self), then the
-- reply/comment notif ONLY if that recipient wasn't just mentioned.
CREATE OR REPLACE FUNCTION on_post_comment_notify()
RETURNS TRIGGER AS $$
DECLARE
  v_post_author   UUID;
  v_parent_author UUID;
  v_mention       UUID;
BEGIN
  -- comment_mention: one row per mentioned user (not coalesced).
  IF NEW.mentions IS NOT NULL THEN
    FOREACH v_mention IN ARRAY NEW.mentions LOOP
      IF v_mention <> NEW.author_id THEN
        INSERT INTO notifications (recipient_id, sender_id, type, payload)
        VALUES (v_mention, NEW.author_id, 'comment_mention',
                jsonb_build_object('post_id', NEW.post_id,
                                   'comment_id', NEW.id));
      END IF;
    END LOOP;
  END IF;

  IF NEW.parent_id IS NULL THEN
    SELECT author_id INTO v_post_author FROM posts WHERE id = NEW.post_id;
    IF NOT (v_post_author = ANY(COALESCE(NEW.mentions, '{}'))) THEN
      PERFORM coalesce_notification(v_post_author, NEW.author_id,
                'post_commented', 'post_id', NEW.post_id);
    END IF;
  ELSE
    SELECT author_id INTO v_parent_author FROM post_comments WHERE id = NEW.parent_id;
    IF NOT (v_parent_author = ANY(COALESCE(NEW.mentions, '{}'))) THEN
      PERFORM coalesce_notification(v_parent_author, NEW.author_id,
                'comment_reply', 'parent_id', NEW.parent_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Read RPCs v3: add author_username (for lowercase reply prefill + mentionables).
DROP FUNCTION IF EXISTS post_comments_ranked(UUID, UUID, INT);
CREATE OR REPLACE FUNCTION post_comments_ranked(
  p_post_id   UUID,
  p_viewer_id UUID,
  p_limit     INT DEFAULT 100
)
RETURNS TABLE (
  id UUID, author_id UUID, author_name TEXT, author_username TEXT,
  author_photo_url TEXT, body TEXT, mentions UUID[], like_count INT,
  reply_count BIGINT, deleted BOOLEAN, liked_by_me BOOLEAN, created_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
  WITH post_author AS (SELECT author_id FROM posts WHERE id = p_post_id)
  SELECT
    c.id, c.author_id, pr.name, pr.username, pr.photo_url,
    CASE WHEN c.deleted_at IS NULL THEN c.body ELSE NULL END,
    c.mentions, c.like_count,
    (SELECT count(*) FROM post_comments r WHERE r.parent_id = c.id) AS reply_count,
    (c.deleted_at IS NOT NULL) AS deleted,
    EXISTS (SELECT 1 FROM comment_likes cl
            WHERE cl.comment_id = c.id AND cl.user_id = p_viewer_id) AS liked_by_me,
    c.created_at
  FROM post_comments c
  JOIN profiles pr ON pr.id = c.author_id
  WHERE c.post_id = p_post_id AND c.parent_id IS NULL
  ORDER BY
    c.like_count
    + (SELECT count(*) FROM post_comments r WHERE r.parent_id = c.id) * 2
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
  id UUID, author_id UUID, author_name TEXT, author_username TEXT,
  author_photo_url TEXT, body TEXT, mentions UUID[], like_count INT,
  deleted BOOLEAN, liked_by_me BOOLEAN, created_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
  SELECT
    c.id, c.author_id, pr.name, pr.username, pr.photo_url,
    CASE WHEN c.deleted_at IS NULL THEN c.body ELSE NULL END,
    c.mentions, c.like_count, (c.deleted_at IS NOT NULL),
    EXISTS (SELECT 1 FROM comment_likes cl
            WHERE cl.comment_id = c.id AND cl.user_id = p_viewer_id) AS liked_by_me,
    c.created_at
  FROM post_comments c
  JOIN profiles pr ON pr.id = c.author_id
  WHERE c.parent_id = p_parent_id
  ORDER BY c.created_at ASC;
$$;
```

- [ ] **Step 2: Commit** (`feat(community): comment @mentions migration (055)`)

---

### Task 2: TS types + notification copy (3 surfaces)

**Files:**
- Modify: `src/types/models.ts` (NotificationType union; `PostComment.author_username`)
- Modify: `src/utils/notificationCopy.ts` (banner/push copy)
- Modify: `supabase/functions/send-push-notification/index.ts` (`composeCopy`)
- Modify: `app/notifications.tsx` (`notifText` + `onPressNotif` + mentions filter)
- Test: `src/utils/__tests__/notificationCopy.test.ts` (new)

**Interfaces:**
- Consumes: `author_username` now present on RPC rows (Task 1).
- Produces: `PostComment.author_username: string`.

- [ ] **Step 1: Failing test for the new copy**

```ts
import { notificationCopy } from '@/utils/notificationCopy';
it('comment_mention copy', () => {
  expect(notificationCopy('comment_mention', { senderName: 'Sri' }).body)
    .toBe('mentioned you in a comment');
});
```

- [ ] **Step 2:** Add `'comment_mention'` to `NotificationType` and
  `author_username: string` to `PostComment`. Add the copy case to
  `notificationCopy.ts` and the edge fn (`title: 'Mention', body: '${senderName} mentioned you in a comment'` for push; banner returns `body: 'mentioned you in a comment'` matching the `mention` shape). In `app/notifications.tsx`: `notifText` case → `<>{who} mentioned you in a comment</>`; add `comment_mention` to the `post_*`/`comment_*` nav group (→ `/(tabs)/community`); add it to the `MENTION_TYPES` set feeding the **Mentions** filter.

- [ ] **Step 3:** `npm run typecheck` (0) + `npx jest notificationCopy --forceExit` (pass). Commit.

---

### Task 3: Reply prefill uses lowercase @username

**Files:**
- Modify: `src/components/community/CommentRow.tsx`

The bug: prefill used `comment.author_name` (display name, capitalised). Switch
to `comment.author_username` so it matches a resolvable, lowercase handle.

- [ ] **Step 1:** In the Reply `onPress`, replace
  `isReply ? \`@${comment.author_name} \` : ''` with
  `isReply ? \`@${comment.author_username} \` : ''`.
- [ ] **Step 2:** typecheck. Commit.

---

### Task 4: Tappable mentions in comment bodies

**Files:**
- Create: `src/components/community/commentMentions.ts` (pure map builder)
- Test: `src/components/community/__tests__/commentMentions.test.ts`
- Modify: `src/components/community/CommentRow.tsx` (render via `MentionText`)
- Modify: `src/components/community/CommentSheet.tsx` (build + thread the map)

**Interfaces:**
- Produces: `buildMentionables(friends: Profile[], comments: PostComment[], self?: Profile): Map<string,string>`
  (lowercase username → id). `CommentRow` gains a `mentionables?: Map<string,string>` prop.

- [ ] **Step 1: Failing test** for `buildMentionables` — union of friends +
  thread comment authors + self, keyed by lowercase username, id as value,
  skipping entries without a username.

```ts
it('maps lowercase username to id from friends + authors + self', () => {
  const map = buildMentionables(
    [{ id: 'f1', username: 'Alex', name: 'Alex', photo_url: null } as any],
    [{ author_id: 'c1', author_username: 'Bea', author_name: 'Bea' } as any],
    { id: 'me', username: 'Me' } as any
  );
  expect(map.get('alex')).toBe('f1');
  expect(map.get('bea')).toBe('c1');
  expect(map.get('me')).toBe('me');
});
```

- [ ] **Step 2:** Implement `buildMentionables` (pure; lowercases keys; ignores
  falsy usernames). Run test → pass.
- [ ] **Step 3:** `CommentRow`: replace `<Text style={styles.text}>{comment.body}</Text>`
  with `<MentionText content={comment.body} style={styles.text} mentionables={mentionables} />`;
  add the `mentionables` prop and pass it to child reply rows.
- [ ] **Step 4:** `CommentSheet`: `const { friends } = useFriends();` build
  `mentionables` (memo) from `friends.map(f => f.friend)` + `comments.data` +
  the auth-store user; pass to each `CommentRow`.
- [ ] **Step 5:** typecheck + jest. Commit.

---

### Task 5: Composer @-autocomplete

**Files:**
- Modify: `src/components/community/CommentComposer.tsx`
- Modify: `src/components/community/CommentSheet.tsx`

Reuse `activeMentionQuery`, `insertMention`, and `MentionAutocomplete` +
`Mentionable` from `src/components/chat/`.

- [ ] **Step 1:** `CommentComposer` gains `people: Mentionable[]`. Compute
  `const q = activeMentionQuery(text);` render `MentionAutocomplete` (above the
  input row) when `q !== null`, `onPick={(u) => setText(insertMention(text, u))}`.
- [ ] **Step 2:** `CommentSheet` builds `people` (memo) from `friends.map(f => f.friend)`
  + thread comment authors, mapped to `Mentionable` (dedupe by id, drop self,
  require username), passes to `CommentComposer`.
- [ ] **Step 3:** typecheck + lint + full jest. Commit.

---

### Verification
- `npm run typecheck` → 0; `npx jest --forceExit` → green; `npm run lint` → no new.
- Append **Phase 2d** section to `docs/superpowers/tests/community-manual-qa.md`
  (DB: mention resolves to `mentions[]`; `comment_mention` row on @mention;
  precedence — mentioning the parent author yields only the mention; self-mention
  is silent. Device: autocomplete strip while typing `@`, tap inserts lowercase
  handle; sent comment shows highlighted tappable handle → profile; Reply prefill
  is lowercase `@handle`; recipient gets "mentioned you in a comment").
- Update memory `community-phase-progress.md` (2d done, migration 055).
