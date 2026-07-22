-- 041: Tapback reactions on messages — one table for both chats.
-- Requires 030 (direct_messages/messages RLS) and 031. Run this whole file in
-- the Supabase SQL editor.

-- ─── THE TABLE ───────────────────────────────────────────────────────────────
-- One row per (message, person). Exactly one of message_id / dm_id is set: a
-- reaction belongs to an event-chat message or to a DM, never both, and a
-- single table means one realtime subscription and one service rather than two
-- of everything that only differ in the column name.
CREATE TABLE IF NOT EXISTS message_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  dm_id      UUID REFERENCES direct_messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT message_reactions_one_target
    CHECK (num_nonnulls(message_id, dm_id) = 1)
);

-- One reaction per person per message — tapping a second emoji replaces the
-- first, iMessage-style.
--
-- These are PARTIAL indexes, and that is load-bearing: a plain
-- UNIQUE (message_id, user_id) would constrain nothing on the DM half of the
-- table, because Postgres treats every NULL as distinct and so lets a person
-- pile up unlimited rows with message_id IS NULL. It fails silently — no
-- error, just duplicate reactions appearing in the UI.
CREATE UNIQUE INDEX IF NOT EXISTS message_reactions_msg_user_idx
  ON message_reactions (message_id, user_id) WHERE message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS message_reactions_dm_user_idx
  ON message_reactions (dm_id, user_id) WHERE dm_id IS NOT NULL;

-- The read path: every reaction for a page of messages.
CREATE INDEX IF NOT EXISTS message_reactions_msg_idx
  ON message_reactions (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS message_reactions_dm_idx
  ON message_reactions (dm_id) WHERE dm_id IS NOT NULL;

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Visibility follows the message: if you can see the conversation you can see
-- its reactions. The membership tests are written inline, in the same shape as
-- chat_reads (031) and dm_pins (030), rather than lifted into a helper — a
-- SECURITY DEFINER helper is exactly what 039 had to go back and harden, and a
-- SECURITY INVOKER one would re-enter RLS on messages/events for every row.
DROP POLICY IF EXISTS "message_reactions_select" ON message_reactions;
CREATE POLICY "message_reactions_select" ON message_reactions
  FOR SELECT TO authenticated
  USING (
    (
      message_id IS NOT NULL
      AND message_id IN (
        SELECT m.id FROM messages m
        WHERE m.event_id IN (
          SELECT event_id FROM event_participants WHERE user_id = auth.uid()
          UNION
          SELECT id FROM events WHERE host_id = auth.uid()
        )
      )
    )
    OR (
      dm_id IS NOT NULL
      AND dm_id IN (
        SELECT dm.id FROM direct_messages dm
        WHERE dm.sender_id = auth.uid() OR dm.recipient_id = auth.uid()
      )
    )
  );

-- You may only add and remove your own, and only in a conversation you're in.
DROP POLICY IF EXISTS "message_reactions_insert" ON message_reactions;
CREATE POLICY "message_reactions_insert" ON message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (
        message_id IS NOT NULL
        AND message_id IN (
          SELECT m.id FROM messages m
          WHERE m.event_id IN (
            SELECT event_id FROM event_participants WHERE user_id = auth.uid()
            UNION
            SELECT id FROM events WHERE host_id = auth.uid()
          )
        )
      )
      OR (
        dm_id IS NOT NULL
        AND dm_id IN (
          SELECT dm.id FROM direct_messages dm
          WHERE dm.sender_id = auth.uid() OR dm.recipient_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "message_reactions_delete" ON message_reactions;
CREATE POLICY "message_reactions_delete" ON message_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─── REALTIME ────────────────────────────────────────────────────────────────
-- FULL replica identity for the same reason as messages in 030: a DELETE
-- payload otherwise carries only the primary key, and the client needs the
-- message id to know which bubble lost a reaction.
ALTER TABLE message_reactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
