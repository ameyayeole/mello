-- ─────────────────────────────────────────────────────────────────────────────
-- HIDE REPORTED POSTS FROM THE REPORTER. on_post_report (061) only auto-hides a
-- post globally once 3 DISTINCT users have reported it — the right bar for
-- taking something away from EVERYONE, but until that threshold the reporter
-- keeps seeing the exact post they just flagged, which is the opposite of
-- what the action implies.
--
-- This goes in posts_select (RLS), not in a feed ranker. posts_select is the
-- single gate every read path already defers to as SECURITY INVOKER —
-- community_feed_page, build_feed_session, user_posts (057), get_post (063).
-- Patching one ranker instead would still leave the post visible on the
-- author's own profile Posts tab and through a deep link to get_post; RLS is
-- the only place that closes all of those at once.
--
-- IMMEDIATE AND RETROACTIVE: the moment this is applied, every existing
-- `reports` row that already has a `post_id` — including old, forgotten
-- reports filed long before this migration existed — will hide that post
-- from that reporter. This is intended, not a migration artefact: a report
-- is a standing request not to see something, and scoping the fix to only
-- future reports would leave old flagged posts still staring back at the
-- people who reported them.
--
-- Re-creates posts_select (044) unchanged except for one added clause. Run
-- this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "posts_select" ON posts;
CREATE POLICY "posts_select" ON posts
  FOR SELECT TO authenticated
  USING (
    hidden = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = posts.author_id)
         OR (b.blocker_id = posts.author_id AND b.blocked_id = auth.uid())
    )
    AND (
      posts.author_id = auth.uid()
      OR posts.visibility = 'public'
      OR EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.status = 'accepted'
          AND ((f.requester_id = auth.uid() AND f.addressee_id = posts.author_id)
            OR (f.addressee_id = auth.uid() AND f.requester_id = posts.author_id))
      )
    )
    -- Reporting something should get it out of your face immediately. The
    -- auto-hide trigger (061) only fires at three distinct reporters, which is
    -- the right bar for hiding a post from EVERYONE — but it leaves the person
    -- who reported it still looking at it, which is the opposite of what the
    -- action implies.
    AND NOT EXISTS (
      SELECT 1 FROM reports r
      WHERE r.reporter_id = auth.uid() AND r.post_id = posts.id
    )
  );
