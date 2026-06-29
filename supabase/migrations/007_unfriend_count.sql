-- ─────────────────────────────────────────────────────────────────────────────
-- UNFRIEND: decrement friends_count when an accepted friendship is removed.
--
-- 004/006 only increment friends_count on pending -> accepted. Deleting a
-- friendship (unfriend, or rejecting after accept) left the count too high.
-- This adds an AFTER DELETE trigger that decrements both users' counts, but
-- only when the removed row was actually 'accepted' (deleting a still-pending
-- request never bumped the count, so it must not decrement it either).
--
-- SECURITY DEFINER so it can update the OTHER user's profile under RLS.
-- GREATEST(..., 0) guards against ever going negative.
-- Run this on the existing database (Supabase SQL editor or migration).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION decrement_friends_count()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'accepted' THEN
    UPDATE profiles SET friends_count = GREATEST(friends_count - 1, 0)
    WHERE id IN (OLD.requester_id, OLD.addressee_id);
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_friendship_deleted ON friendships;
CREATE TRIGGER on_friendship_deleted
  AFTER DELETE ON friendships
  FOR EACH ROW EXECUTE FUNCTION decrement_friends_count();
