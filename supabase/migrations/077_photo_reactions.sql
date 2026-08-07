-- ─────────────────────────────────────────────────────────────────────────────
-- PHOTO REACTIONS. A binary like becomes the same four-emoji tapback the chat
-- already uses (041_message_reactions + ReactionBar's TAPBACKS), so a react
-- means one thing across the app.
--
-- `event_photos.like_count` is KEPT and redefined as a total reaction count.
-- It is what orders `top_photos`, which is what a shared_wrap card shows in the
-- Community feed (033 / 059) — redefining what it counts leaves that working,
-- where removing it would silently empty those cards.
--
-- wrap_photo_likes is migrated across and then left alone. Dropping it would
-- make this irreversible without a restore, and an unused table costs nothing.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS photo_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id   UUID NOT NULL REFERENCES event_photos(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id)     ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One reaction per person per photo; a second emoji replaces the first.
-- The upsert in reactToPhoto names this pair as its ON CONFLICT target, so this
-- index is what makes "replace" work rather than "stack".
CREATE UNIQUE INDEX IF NOT EXISTS photo_reactions_photo_user_idx
  ON photo_reactions (photo_id, user_id);
CREATE INDEX IF NOT EXISTS photo_reactions_photo_idx
  ON photo_reactions (photo_id);

ALTER TABLE photo_reactions ENABLE ROW LEVEL SECURITY;

-- Visibility follows the photo: if you attended, you can see its reactions.
DROP POLICY IF EXISTS "photo_reactions_select" ON photo_reactions;
CREATE POLICY "photo_reactions_select" ON photo_reactions
  FOR SELECT TO authenticated
  USING (
    photo_id IN (
      SELECT p.id FROM event_photos p
      WHERE is_event_attendee(p.event_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "photo_reactions_write" ON photo_reactions;
CREATE POLICY "photo_reactions_write" ON photo_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND photo_id IN (
      SELECT p.id FROM event_photos p
      WHERE is_event_attendee(p.event_id, auth.uid())
    )
  );

-- The upsert path issues an UPDATE when a row already exists, so without an
-- UPDATE policy swapping one emoji for another is refused by RLS while the
-- first reaction succeeds — a bug that only shows on the second tap.
DROP POLICY IF EXISTS "photo_reactions_update" ON photo_reactions;
CREATE POLICY "photo_reactions_update" ON photo_reactions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "photo_reactions_delete" ON photo_reactions;
CREATE POLICY "photo_reactions_delete" ON photo_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Carry existing likes over as hearts.
INSERT INTO photo_reactions (photo_id, user_id, emoji, created_at)
SELECT l.photo_id, l.user_id, '❤️', l.created_at
  FROM wrap_photo_likes l
ON CONFLICT DO NOTHING;

-- like_count now means "reactions".
CREATE OR REPLACE FUNCTION bump_photo_reaction_count()
RETURNS TRIGGER AS $$
DECLARE
  v_photo UUID;
BEGIN
  -- Branch on TG_OP rather than COALESCE(NEW.photo_id, OLD.photo_id): in a
  -- PL/pgSQL row trigger NEW is unassigned on DELETE, and reading a field of it
  -- raises rather than yielding NULL. The COALESCE form would therefore fail on
  -- exactly the path that removes a reaction.
  IF TG_OP = 'DELETE' THEN
    v_photo := OLD.photo_id;
  ELSE
    v_photo := NEW.photo_id;
  END IF;

  UPDATE event_photos p
     SET like_count = (
       SELECT COUNT(*) FROM photo_reactions r WHERE r.photo_id = p.id
     )
   WHERE p.id = v_photo;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS photo_reactions_count ON photo_reactions;
CREATE TRIGGER photo_reactions_count
  AFTER INSERT OR DELETE OR UPDATE ON photo_reactions
  FOR EACH ROW EXECUTE FUNCTION bump_photo_reaction_count();

-- Backfill so top_photos is correct the moment this lands. Runs after the
-- migrating INSERT above, which predates the trigger.
UPDATE event_photos p
   SET like_count = (
     SELECT COUNT(*) FROM photo_reactions r WHERE r.photo_id = p.id
   );
