# Community Phase 5 — Shared wraps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Reshare an event's **wrap** as a Community post — a `shared_wrap` post
that *references* the event (`ref_wrap_event_id`) and renders a top-photos grid +
title, tapping through to the full wrap. Only the event's host/attendees may
create one (DB-enforced).

**Architecture:** Wraps are **referenced, never merged** (spec §5). A `shared_wrap`
post carries no copied media — it stores `ref_wrap_event_id` and an optional
caption in `body`. The card loads its preview via a new lean `get_wrap_card(event_id)`
RPC that returns the **same shape as `get_explore_wraps`** (title, activity,
location, ended_at, photo_count, top_photos) for one event — so the client reuses
the existing `ExploreWrap` type. Creation is gated by tightening the `posts_insert`
RLS: a `shared_wrap` row requires `is_event_attendee(ref_wrap_event_id, auth.uid())`
(the helper from migration 032 — host or approved attendee). The entry point is a
**Share** button in the wrap-hub header (`app/events/wrap/[eventId].tsx`, where
`isAttendee` is already computed) that opens a small caption+visibility sheet.

**Tech Stack:** Supabase plpgsql, TanStack Query v5, expo-router, expo-haptics.

## Global Constraints
- Never hardcode a colour/font/radius — `COLORS` / `FONTS` / `TYPE_SIZE` / `RADIUS` / `SPACING`.
- No new glass tier — shared-wrap cards are `panel` (spec §12).
- Reuse, don't fork: the `ExploreWrap` type, `is_event_attendee` (032),
  `ScreenHeader`'s `right` slot, `IconButton`, `Sheet`/`Button`/`TextField`, the
  `get_explore_wraps` top-photos aggregation.
- Feed/profile invalidation goes through `queryKeys.community.feed.all` +
  `.userPosts.all` (never hand-typed).
- Wraps are **referenced, never merged** — a `shared_wrap` post stores no media;
  deleting the post never touches wrap data (and `ref_wrap_event_id` is
  `ON DELETE SET NULL`, so deleting the event leaves a graceful empty card).

---

### Task 1: Migration 059 — shared_wrap insert RLS + get_wrap_card RPC

**Files:**
- Create: `supabase/migrations/059_shared_wraps.sql`

**Interfaces:**
- Produces: `posts_insert` now gates `shared_wrap` on attendance; a
  `posts_shared_wrap_has_ref` CHECK; `get_wrap_card(p_event_id UUID)` returning
  one `ExploreWrap`-shaped row.

Design notes:
- The base insert rule stays `author_id = auth.uid()`; the added clause only
  bites `type = 'shared_wrap'` (other types are unaffected — `OR type <> 'shared_wrap'`).
- CHECK: a `shared_wrap` must carry a `ref_wrap_event_id` (a dangling reshare is
  meaningless). Existing rows are all non-shared_wrap, so `ADD CONSTRAINT` is safe.
- `get_wrap_card` mirrors `get_explore_wraps` (033) for a single event **without**
  the public/14-day/≥3-photos gates — the referenced event may be private and the
  post's own RLS already decided who sees the card. `SECURITY DEFINER` like its
  sibling; returns non-hidden photos only.
- Header must NOT start a line with the `COMMENT` keyword (editor splitter). Run
  whole file in the SQL editor.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- SHARED WRAPS. A shared_wrap post references an event's wrap (ref_wrap_event_id)
-- and copies no media. Only the event's host/approved attendees may create one
-- (is_event_attendee, migration 032), enforced by tightening posts_insert. The
-- card preview comes from get_wrap_card — get_explore_wraps' shape for one event,
-- without the public/recency gates (the post's own RLS already gates who sees it).
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- A shared_wrap must point at an event.
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_shared_wrap_has_ref;
ALTER TABLE posts ADD CONSTRAINT posts_shared_wrap_has_ref
  CHECK (type <> 'shared_wrap' OR ref_wrap_event_id IS NOT NULL);

-- INSERT: your own post, and — for a shared_wrap — only if you attended the event.
DROP POLICY IF EXISTS "posts_insert" ON posts;
CREATE POLICY "posts_insert" ON posts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND (
      type <> 'shared_wrap'
      OR is_event_attendee(ref_wrap_event_id, auth.uid())
    )
  );

-- One event's wrap preview (title + top 6 photos), for rendering a shared_wrap
-- card. Same columns as get_explore_wraps; no public/recency gate (by event id).
CREATE OR REPLACE FUNCTION get_wrap_card(p_event_id UUID)
RETURNS TABLE (
  event_id      UUID,
  title         TEXT,
  activity      activity_type,
  location_name TEXT,
  ended_at      TIMESTAMPTZ,
  photo_count   BIGINT,
  top_photos    JSONB
) AS $$
  SELECT
    e.id,
    e.title,
    e.activity,
    e.location_name,
    COALESCE(e.ends_at, e.starts_at + INTERVAL '4 hours') AS ended_at,
    (SELECT COUNT(*) FROM event_photos p
      WHERE p.event_id = e.id AND p.hidden = FALSE) AS photo_count,
    (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT p.id, p.url, p.like_count
        FROM event_photos p
        WHERE p.event_id = e.id AND p.hidden = FALSE
        ORDER BY p.like_count DESC, p.created_at ASC
        LIMIT 6
      ) t) AS top_photos
  FROM events e
  WHERE e.id = p_event_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_wrap_card(UUID) TO authenticated;
```

- [ ] **Step 2: Commit** (`feat(community): shared_wrap insert RLS + get_wrap_card (059)`)

---

### Task 2: Service — createSharedWrap + getWrapCard

**Files:**
- Modify: `src/services/community/posts.service.ts` (`createSharedWrap`)
- Modify: `src/services/wrap.service.ts` (`getWrapCard`)

**Interfaces:**
- Consumes: `ExploreWrap` (existing type — exact shape of `get_wrap_card`).
- Produces:
  - `createSharedWrap({ authorId, eventId, body, visibility, city }) => Promise<string>`
  - `getWrapCard(eventId) => Promise<ExploreWrap | null>`

- [ ] **Step 1: createSharedWrap.** Add to `posts.service.ts` below `createPhotoPost`:

```ts
export async function createSharedWrap(params: {
  authorId: string;
  eventId: string;
  body: string; // optional caption; '' ⇒ null
  visibility: PostVisibility;
  city: string | null;
}): Promise<string> {
  const caption = params.body.trim();
  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: params.authorId,
      type: 'shared_wrap',
      body: caption.length > 0 ? caption : null,
      ref_wrap_event_id: params.eventId,
      visibility: params.visibility,
      city: params.city,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}
```

- [ ] **Step 2: getWrapCard.** Add to `wrap.service.ts` (near `getWrapSummary`):

```ts
// The lean wrap preview (title + top photos) behind a shared_wrap post card.
// get_explore_wraps' shape for one event; returns null if the event is gone
// (ref_wrap_event_id is ON DELETE SET NULL → the card renders an empty state).
export async function getWrapCard(eventId: string): Promise<ExploreWrap | null> {
  const { data, error } = await supabase.rpc('get_wrap_card', {
    p_event_id: eventId,
  });
  if (error) throw error;
  const rows = (data ?? []) as ExploreWrap[];
  return rows[0] ?? null;
}
```

  (Ensure `ExploreWrap` is imported in `wrap.service.ts`.)

- [ ] **Step 3:** `npm run typecheck` → 0. Commit
  (`feat(community): createSharedWrap + getWrapCard service`).

---

### Task 3: Query key + hooks (useWrapCard, useCreateSharedWrap)

**Files:**
- Modify: `src/constants/queryKeys.ts` (`community.wrapCard`)
- Create: `src/hooks/useWrapCard.ts`
- Modify: `src/hooks/usePostMutations.ts` (`useCreateSharedWrap`)

**Interfaces:**
- Produces: `queryKeys.community.wrapCard.of(eventId)`; `useWrapCard(eventId)`
  (query); `useCreateSharedWrap()` (mutation → invalidates feed + userPosts).

- [ ] **Step 1: Query key.** In `queryKeys.ts` `community` family add:

```ts
    wrapCard: {
      all: ['community', 'wrapCard'] as const,
      of: (eventId: Id) => ['community', 'wrapCard', eventId] as const,
    },
```

- [ ] **Step 2: useWrapCard.** Create `src/hooks/useWrapCard.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getWrapCard } from '@/services/wrap.service';

// Preview data for a shared_wrap card. Wrap content rarely changes after the
// event, so a long staleTime is fine.
export function useWrapCard(eventId: string) {
  return useQuery({
    queryKey: queryKeys.community.wrapCard.of(eventId),
    queryFn: () => getWrapCard(eventId),
    staleTime: 5 * 60_000,
  });
}
```

- [ ] **Step 3: useCreateSharedWrap.** In `usePostMutations.ts`, import
  `createSharedWrap` and add (next to `useCreatePoll`):

```ts
export function useCreateSharedWrap() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  return useMutation({
    mutationFn: (args: {
      eventId: string;
      body: string;
      visibility: PostVisibility;
    }) =>
      createSharedWrap({
        authorId: user!.id,
        eventId: args.eventId,
        body: args.body,
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

  (Extend the existing `posts.service` import to include `createSharedWrap`.)

- [ ] **Step 4:** `npm run typecheck` → 0. Commit
  (`feat(community): useWrapCard + useCreateSharedWrap hooks`).

---

### Task 4: SharedWrapCard render + PostCard branch

**Files:**
- Create: `src/components/community/SharedWrapCard.tsx`
- Modify: `src/components/community/PostCard.tsx`

**Interfaces:**
- Consumes: `useWrapCard`, `ExploreWrap`, `ACTIVITY_MAP`, `expo-image`, `useRouter`.
- Produces: `<SharedWrapCard eventId={string} caption={string} />`.

Behaviour: a tappable panel-inset block showing the wrap's **title + meta**
(activity emoji · location · "N photos") and a **2×N thumbnail grid** of
`top_photos` (up to 6, square, rounded), with the post caption above if present.
Tapping anywhere → `/events/wrap/{eventId}`. If `useWrapCard` returns null (event
deleted) → a muted "This wrap is no longer available" block (no tap).

- [ ] **Step 1: Build SharedWrapCard.**
  - `const wrap = useWrapCard(eventId); const router = useRouter();`
  - Loading: a short skeleton (title bar + a grey photo row).
  - Null data: muted `EmptyState`-style line (local `Text`), no press.
  - Loaded: a `PressableScale` (`scaleTo={0.99}`) → `router.push(\`/events/wrap/${eventId}\`)`:
    - caption (`{caption ? <TextPostBody body={caption} /> : null}` — reuse it).
    - a header row: activity emoji (`ACTIVITY_MAP[wrap.activity]?.emoji ?? '📍'`) +
      `wrap.title` (bold, 1 line) + meta line (`location_name` · `photo_count`
      photos · relative ended date).
    - a thumbnail grid: `wrap.top_photos.slice(0, 6)` as square `expo-image`
      tiles, 3 across, small gutters (a "wrap" badge/overlay is optional — skip
      for MVP). Empty `top_photos` → a single "No photos in this wrap" line.
    - a footer chip/row "View wrap →" (uses `Icon` chevronRight; `COLORS`).
  - No colour/font literals; panel-inset background uses `COLORS.inkFaint` or the
    card's own surface with a hairline `COLORS.border`.

- [ ] **Step 2: PostCard branch.** Add after the poll branch:

```tsx
{post.type === 'shared_wrap' && post.ref_wrap_event_id ? (
  <View style={styles.media}>
    <SharedWrapCard
      eventId={post.ref_wrap_event_id}
      caption={post.body ?? ''}
    />
  </View>
) : null}
```

  **Note:** `CommunityPost` currently has no `ref_wrap_event_id` field — the feed
  RPCs (`community_feed`, `user_posts`) don't return it. Add it in Step 3.

- [ ] **Step 3: Thread `ref_wrap_event_id` through the feed.** This is the one
  schema-touch on the read path:
  - `src/types/models.ts`: add `ref_wrap_event_id: string | null;` to `CommunityPost`.
  - Migrations `community_feed` (051) and `user_posts` (057) must also **return**
    it. Create **migration 060** that re-creates both RPCs with one added output
    column `ref_wrap_event_id UUID` (select `p.ref_wrap_event_id`), `DROP` first
    (RETURNS TABLE change). Copy each function verbatim from its latest migration
    and add the column in both the `RETURNS TABLE(...)` list and the `SELECT`.
    Commit the migration in this task.

  ```sql
  -- 060_feed_ref_wrap.sql — community_feed + user_posts also return
  -- ref_wrap_event_id so shared_wrap cards can resolve their event. Whole file.
  -- (Re-create both from 051 / 057, adding `ref_wrap_event_id UUID` to RETURNS
  --  TABLE and `p.ref_wrap_event_id` to the SELECT list. DROP FUNCTION first.)
  ```

  Write the full re-created bodies (both functions) in the migration — do not
  abbreviate; the executor may read this file in isolation.

- [ ] **Step 4:** `npm run typecheck` → 0; `npm run lint` on touched files → no
  new; `npx jest --forceExit` → green. Commit
  (`feat(community): SharedWrapCard + feed returns ref_wrap_event_id (060)`).

---

### Task 5: ShareWrapSheet + Share button on the wrap hub

**Files:**
- Create: `src/components/community/ShareWrapSheet.tsx`
- Modify: `app/events/wrap/[eventId].tsx`

**Interfaces:**
- Consumes: `useCreateSharedWrap`, `Sheet`/`Button`/`TextField`, the visibility
  chip pattern.
- Produces: `<ShareWrapSheet eventId visible onClose />`; a Share `IconButton` in
  the wrap-hub header, shown to attendees.

- [ ] **Step 1: ShareWrapSheet.** A trimmed `ComposePostSheet`: title
  "Share to Community", an optional caption `TextField` (placeholder "Say
  something about this wrap…", `MAX` 280), the Friends/Public visibility chip pair
  (default `friends`), and a `Button` "Share". Submit →
  `useCreateSharedWrap().mutate({ eventId, body: caption.trim(), visibility }, {
  onSuccess: Success haptic + reset + onClose, onError: Error haptic })`. Reuse
  the chip styles verbatim from `ComposePostSheet` (copy the `visRow`/`chip*`
  block). No photo picker, no mode toggle.

- [ ] **Step 2: Wire the header button.** In `app/events/wrap/[eventId].tsx`:
  - Add `const [shareOpen, setShareOpen] = useState(false);`
  - Give the main-return `ScreenHeader` a `right`:

    ```tsx
    <ScreenHeader
      title="Event wrap"
      tone="transparent"
      right={
        <IconButton
          icon="share"
          variant="surface"
          onPress={() => setShareOpen(true)}
          accessibilityLabel="Share to Community"
        />
      }
    />
    ```

    (Confirm the icon name — use the same share glyph the event detail screen
    uses; if it's `shareEvent`'s icon, match it. Import `IconButton` from
    `@/components/ui`.)
  - Before the closing `</Screen>`, render:

    ```tsx
    <ShareWrapSheet
      eventId={eventId!}
      visible={shareOpen}
      onClose={() => setShareOpen(false)}
    />
    ```

  The header only renders in the `isAttendee` branch (the guard above returns
  early for non-attendees), so the button is correctly attendee-only — matching
  the RLS. Add a one-line comment noting that.

- [ ] **Step 3:** `npm run typecheck` → 0; `npm run lint` on touched files → no
  new. Commit (`feat(community): ShareWrapSheet + share button on wrap hub`).

---

### Verification
- `npm run typecheck` → 0; `npx jest --forceExit` → green; `npm run lint` on
  touched files → no new.
- Apply migrations **059** and **060** in the Supabase SQL editor (whole files).
- Append a **Phase 5** section to `docs/superpowers/tests/community-manual-qa.md`:
  - **DB / integrity:** a non-attendee inserting a `shared_wrap` for an event is
    **rejected** by RLS; a `shared_wrap` with null `ref_wrap_event_id` is rejected
    by the CHECK; `get_wrap_card(event)` returns title + up to 6 top photos;
    `community_feed` / `user_posts` now return `ref_wrap_event_id`.
  - **Device:** from a wrapped event you attended, the wrap hub shows a **Share**
    button (host + approved attendee only); sharing with an optional caption posts
    a `shared_wrap`; the feed card shows title + meta + top-photos grid + caption
    and **taps through to the wrap**; a non-attendee viewing the feed sees the card
    (if the post's visibility allows) but has no Share button on that wrap;
    deleting the underlying event leaves a graceful "no longer available" card;
    delete-own removes the shared_wrap from feed + profile; Android flat-glass grid
    legible.
- Update memory `community-feed-project.md` (Phase 5 done, migrations 059 + 060;
  Phases 6–7 + final text pass next).
