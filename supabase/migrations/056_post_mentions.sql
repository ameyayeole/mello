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
