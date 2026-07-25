-- ─────────────────────────────────────────────────────────────────────────────
-- REALTIME for post_comments: without this the useComments postgres_changes
-- subscription never fires (a table must be in the supabase_realtime publication
-- to emit change events). REPLICA IDENTITY FULL ships the old row on UPDATE/DELETE
-- so the post_id=eq.<id> filter still matches those events — same as
-- message_reactions (041). Run whole in the SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE post_comments REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE post_comments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
