-- 031: Read receipts for WhatsApp-style ticks (clock → ✓ sent → ✓✓ read).
-- DMs get a read_at per message; event chats track a per-user "read up to"
-- watermark (✓✓ when every other member has read past the message).
-- Run this whole file in the Supabase SQL editor (after 030).

-- ─── DM READ RECEIPTS ────────────────────────────────────────────────────────
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- The recipient may mark messages sent to them as read.
DROP POLICY IF EXISTS "direct_messages_update_read" ON direct_messages;
CREATE POLICY "direct_messages_update_read" ON direct_messages
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- ─── EVENT CHAT READ WATERMARKS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_reads (
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

ALTER TABLE chat_reads ENABLE ROW LEVEL SECURITY;

-- Chat members can see each other's watermarks (needed to compute ✓✓);
-- everyone maintains only their own row.
DROP POLICY IF EXISTS "chat_reads_select" ON chat_reads;
CREATE POLICY "chat_reads_select" ON chat_reads
  FOR SELECT TO authenticated
  USING (
    event_id IN (
      SELECT event_id FROM event_participants WHERE user_id = auth.uid()
      UNION
      SELECT id FROM events WHERE host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_reads_upsert" ON chat_reads;
CREATE POLICY "chat_reads_upsert" ON chat_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_reads_update" ON chat_reads;
CREATE POLICY "chat_reads_update" ON chat_reads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Live tick flips.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_reads;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
