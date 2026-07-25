# Community Phase 3b — Caption @mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let people @mention others in a post caption (text posts and photo-post
captions) — autocomplete while composing, tappable highlighted handles in the
rendered feed, and a "[user] mentioned you in a post" notification — reusing the
comment-mention primitives verbatim.

**Architecture:** Mirror the comment path exactly (migration 055). Parsing +
notification are **server-side**: a `BEFORE INSERT OR UPDATE OF body` trigger
resolves `@username` tokens in `posts.body` into a new `posts.mentions UUID[]`
column; a new `AFTER INSERT` trigger fans out one non-coalesced `post_mention`
per resolved id (excluding self). The **feed RPC is NOT changed** — rendering
resolves handle→id client-side via the existing `getProfilesByUsernames`, so
there is no breaking `DROP FUNCTION community_feed`. The client reuses
`MentionText` / `MentionAutocomplete` / `activeMentionQuery` / `insertMention`
from `src/components/chat/`, `useMentionSearch` / `useThreadMentionables` from
`src/hooks/useMentions.ts`, and `extractMentionUsernames` — none forked.

**Tech Stack:** Supabase plpgsql, TanStack Query v5, Reanimated 4, expo-router.

## Global Constraints
- Never hardcode a colour/font/radius — `COLORS` / `FONTS` / `TYPE_SIZE` / `RADIUS` / `SPACING`.
- `notification_type` lives in **two** places (PG enum + TS union); copy in
  **three** surfaces (`notificationCopy.ts`, `send-push-notification`'s
  `composeCopy`, `app/notifications.tsx`'s `notifText` + `onPressNotif`), plus the
  `MENTION_TYPES` filter set in `app/notifications.tsx`.
- Usernames are lowercase `^[a-z0-9._]{3,30}$` (migration 029). Mention tokens
  render/prefill lowercase; resolution is case-insensitive.
- Don't fork a primitive — reuse the `chat/` mention pieces and the `useMentions`
  hooks that Phase 2d already wired for comments.
- Token grammar is `@([a-zA-Z0-9._]+)` everywhere (client regex + server regex) —
  do not diverge it.

---

### Task 1: Migration 056 — posts.mentions, resolve trigger, post_mention notify

**Files:**
- Create: `supabase/migrations/056_post_mentions.sql`

**Interfaces:**
- Produces: `posts.mentions UUID[]` auto-populated from the body; `notification_type`
  gains `post_mention`; one `post_mention` notification row per mentioned id on
  insert. **`community_feed`'s signature is unchanged.**

Design notes baked in:
- **Resolution scope:** any `@username` matching a real profile resolves
  (excluding self). No friend/visibility gate for MVP — the composer's
  autocomplete steers who; tighten later if spammed. Same rule as comments (055).
- **Not coalesced:** one `post_mention` row per (mention, post). Mentions are
  personal; "X and 2 others mentioned you" reads wrong. Payload carries
  `{ post_id }` for tap-nav to the community feed.
- **No precedence conflict:** unlike comments (where a mention suppresses the
  post_commented/comment_reply), a post insert fires **no other** notification —
  post_liked is on `post_likes`, post_commented is on `post_comments`. So the
  post-insert trigger only ever emits `post_mention`. Simpler than 055.
- **Column, not inline:** store `posts.mentions` (mirrors `post_comments.mentions`)
  so the notify trigger is a plain `FOREACH` and the pattern matches 055 — the
  boring, proven choice.
- Header must NOT start a line with the `COMMENT` keyword (Supabase editor
  splitter tokenizes before stripping `--`; bit us on 049/050). Run whole file.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- MENTIONS in post captions. A BEFORE trigger resolves @username tokens in
-- posts.body into posts.mentions (any real profile, excluding self — the composer
-- steers who; no visibility gate for MVP). A separate AFTER-INSERT trigger fans
-- out one non-coalesced 'post_mention' per mentioned id. A post insert fires no
-- other notification, so there is no precedence rule to apply (unlike comments,
-- 055). Rendering resolves handles client-side, so community_feed is untouched.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE posts ADD COLUMN IF NOT EXISTS mentions UUID[] NOT NULL DEFAULT '{}';

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'post_mention';

-- Resolve @username → profile ids into NEW.mentions on write. A null body (pure
-- photo post) resolves to '{}' via COALESCE. Excludes the author.
CREATE OR REPLACE FUNCTION resolve_post_mentions()
RETURNS TRIGGER AS $$
BEGIN
  NEW.mentions := COALESCE((
    SELECT array_agg(DISTINCT p.id)
    FROM (
      SELECT DISTINCT lower(m[1]) AS uname
      FROM regexp_matches(COALESCE(NEW.body, ''), '@([a-zA-Z0-9._]+)', 'g') m
    ) t
    JOIN profiles p ON lower(p.username) = t.uname
    WHERE p.id <> NEW.author_id
  ), '{}');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS resolve_post_mentions ON posts;
CREATE TRIGGER resolve_post_mentions
  BEFORE INSERT OR UPDATE OF body ON posts
  FOR EACH ROW EXECUTE FUNCTION resolve_post_mentions();

-- Notify: one post_mention per mentioned id (excluding self), non-coalesced.
CREATE OR REPLACE FUNCTION on_post_insert_notify()
RETURNS TRIGGER AS $$
DECLARE
  v_mention UUID;
BEGIN
  IF NEW.mentions IS NOT NULL THEN
    FOREACH v_mention IN ARRAY NEW.mentions LOOP
      IF v_mention <> NEW.author_id THEN
        INSERT INTO notifications (recipient_id, sender_id, type, payload)
        VALUES (v_mention, NEW.author_id, 'post_mention',
                jsonb_build_object('post_id', NEW.id));
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_insert_notify ON posts;
CREATE TRIGGER on_post_insert_notify
  AFTER INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION on_post_insert_notify();
```

- [ ] **Step 2: Commit** (`feat(community): post caption @mentions migration (056)`)

---

### Task 2: TS types + notification copy (3 surfaces + filter)

**Files:**
- Modify: `src/types/models.ts` (`NotificationType` union)
- Modify: `src/utils/notificationCopy.ts` (banner/push copy)
- Modify: `supabase/functions/send-push-notification/index.ts` (`composeCopy`)
- Modify: `app/notifications.tsx` (`notifText` + `onPressNotif` + `MENTION_TYPES`)
- Test: `src/utils/__tests__/notificationCopy.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `'post_mention'` is a valid `NotificationType` end-to-end.

- [ ] **Step 1: Failing test for the new copy** — add to the existing file:

```ts
it('post_mention copy', () => {
  expect(notificationCopy('post_mention', { senderName: 'Sri' }).body)
    .toBe('mentioned you in a post');
});
```

- [ ] **Step 2: Run → fail.** `npx jest notificationCopy --forceExit`
  Expected: FAIL (no `post_mention` case).

- [ ] **Step 3: Implement.**
  - `src/types/models.ts`: add `| 'post_mention'` to the `NotificationType`
    union (next to `'comment_mention'`).
  - `src/utils/notificationCopy.ts`: add a case mirroring `comment_mention`:

    ```ts
    case 'post_mention':
      // Not coalesced (one row per post) — body mirrors the chat `mention` shape.
      return { title: 'Mention', body: 'mentioned you in a post' };
    ```

  - `supabase/functions/send-push-notification/index.ts` `composeCopy`: add
    below the `comment_mention` case:

    ```ts
    case 'post_mention':
      return {
        title: 'Mention',
        body: `${senderName} mentioned you in a post`,
      };
    ```

  - `app/notifications.tsx`:
    - `notifText`: add below the `comment_mention` case:
      `case 'post_mention':\n  return <>{who} mentioned you in a post</>;`
    - `onPressNotif`: add `case 'post_mention':` to the same group as
      `post_liked` / `post_commented` / `comment_mention` (the one that does
      `return dismiss(() => router.push('/(tabs)/community'));`).
    - `MENTION_TYPES`: add `'post_mention'` to the Set (next to
      `'comment_mention'`) so it shows under the **Mentions** filter.

- [ ] **Step 4: Run → pass.** `npx jest notificationCopy --forceExit`; then
  `npm run typecheck` → 0. Commit (`feat(community): post_mention notification copy (3 surfaces)`).

---

### Task 3: Composer @-autocomplete in ComposePostSheet

**Files:**
- Modify: `src/components/community/ComposePostSheet.tsx`

**Interfaces:**
- Consumes: `activeMentionQuery`, `insertMention`, `MentionAutocomplete` (default)
  from `@/components/chat/MentionAutocomplete`; `useMentionSearch` from
  `@/hooks/useMentions`.

Behaviour: while the caption is mid-`@token`, an autocomplete strip appears above
the visibility row; picking inserts the lowercase handle. Identical wiring to
`CommentComposer` (which already does exactly this).

- [ ] **Step 1: Implement.** In `ComposePostSheet`:
  - Add imports:

    ```ts
    import MentionAutocomplete, {
      activeMentionQuery,
      insertMention,
    } from '@/components/chat/MentionAutocomplete';
    import { useMentionSearch } from '@/hooks/useMentions';
    ```

  - After `const trimmed = body.trim();` add:

    ```ts
    // Non-null while mid-"@…" → live people search. Not friend-limited (you can
    // @ anyone the resolver finds); searchMentionables hides self/blocked.
    const mentionQuery = activeMentionQuery(body);
    const people = useMentionSearch(mentionQuery);
    ```

  - Render the strip directly above the `visRow` block:

    ```tsx
    {mentionQuery !== null ? (
      // `people` is already server-filtered for the active token; pass query=""
      // so the strip's own prefix filter doesn't drop legit substring matches.
      <MentionAutocomplete
        query=""
        people={people}
        onPick={(u) => setBody((t) => insertMention(t, u))}
      />
    ) : null}
    ```

  Note: `insertMention` may push the caption past `MAX`; that's fine — the Post
  gate already blocks `trimmed.length > MAX`, and the counter shows red. Do not
  slice inside `onPick` or it would truncate the freshly-inserted handle.

- [ ] **Step 2:** `npm run typecheck` → 0; `npm run lint` on the file → no new.
  Commit (`feat(community): @mention autocomplete in post composer`).

---

### Task 4: Render — tappable mentions in captions (feed-wide map)

**Files:**
- Modify: `src/hooks/useMentions.ts` (widen `useThreadMentionables` input type)
- Modify: `src/components/community/TextPostBody.tsx` (render via `MentionText`)
- Modify: `src/components/community/PostCard.tsx` (accept + thread `mentionables`)
- Modify: `app/(tabs)/community.tsx` (build the map, pass to each `PostCard`)
- Test: `src/hooks/__tests__/useMentions.test.ts` (create if absent — pure-input
  test of the widened signature is not renderer-dependent; if the file can't be
  created without a renderer, skip and rely on typecheck — note it in the commit)

**Interfaces:**
- Consumes: `extractMentionUsernames` (already accepts `{ body: string | null }[]`),
  `getProfilesByUsernames`.
- Produces: `useThreadMentionables(rows: { body: string | null }[] | undefined)`
  — widened from `PostComment[]` to the structural `{ body }[]` so `CommunityPost[]`
  also satisfies it. Returns `Map<lowercaseUsername, id>` including the viewer.
  `TextPostBody` gains `mentionables?: Map<string,string>`. `PostCard` gains
  `mentionables?: Map<string,string>`.

- [ ] **Step 1: Widen the hook input.** In `src/hooks/useMentions.ts`, change
  the `useThreadMentionables` parameter type from `comments: PostComment[] | undefined`
  to `rows: { body: string | null }[] | undefined`, and rename the local use of
  `comments` to `rows` inside the function (the body only passes it to
  `extractMentionUsernames`, which already takes `{ body }[]`). Drop the now-unused
  `PostComment` import **only if** nothing else in the file uses it (it doesn't —
  verify with a grep). Update the doc comment's "comments" wording to "rows".

- [ ] **Step 2: `TextPostBody` renders via `MentionText`.** Replace the body:

  ```tsx
  import MentionText from '@/components/chat/MentionText';
  // ...
  export function TextPostBody({
    body,
    mentionables,
  }: {
    body: string;
    mentionables?: Map<string, string>;
  }) {
    return <MentionText content={body} style={styles.body} mentionables={mentionables} />;
  }
  ```

  `MentionText` falls back to plain text when `mentionables` is undefined or a
  token doesn't resolve, so text posts with no mentions are unchanged. Keep the
  `styles.body` StyleSheet exactly as-is.

- [ ] **Step 3: `PostCard` accepts + threads the map.** Add
  `mentionables,` to the destructured props and its type
  (`mentionables?: Map<string, string>;`). Pass it to **both** `TextPostBody`
  usages (the `text` branch and the photo-caption branch):
  `<TextPostBody body={post.body} mentionables={mentionables} />`.

- [ ] **Step 4: Build + pass the map in the feed.** In `app/(tabs)/community.tsx`:
  - Import: `import { useThreadMentionables } from '@/hooks/useMentions';`
  - After `const posts = useMemo(...)`, add:
    `const mentionables = useThreadMentionables(posts);`
  - Pass `mentionables={mentionables}` to the `<PostCard ... />` in `renderItem`.

  (The map resolves every @handle present across all loaded feed pages in one
  keyed query, plus the viewer — same shape `CommentSheet` uses for threads.)

- [ ] **Step 5:** `npm run typecheck` → 0; `npm run lint` on touched files → no
  new. Run `npx jest --forceExit` → green. Commit
  (`feat(community): tappable @mentions in post captions`).

---

### Verification
- `npm run typecheck` → 0; `npx jest --forceExit` → green; `npm run lint` on
  touched files → no new.
- Apply migration 056 in the Supabase SQL editor (whole file).
- Append a **Phase 3b** section to `docs/superpowers/tests/community-manual-qa.md`:
  - **DB:** posting a caption with `@handle` populates `posts.mentions`; a
    `post_mention` notification row lands for the mentioned user; a self-mention
    is silent; a pure-photo post (null body) resolves `mentions` to `{}` with no
    error.
  - **Device:** typing `@` in the composer shows the autocomplete strip; picking
    inserts the lowercase handle; the published post shows the handle highlighted
    and tappable → profile; the mentioned user gets "mentioned you in a post" and
    it appears under the **Mentions** filter and taps through to the feed;
    Android flat-glass strip still legible.
- Update memory `community-phase-progress.md` (3b done, migration 056; 3c next).
