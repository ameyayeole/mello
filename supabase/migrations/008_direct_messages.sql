-- ─────────────────────────────────────────────────────────────────────────────
-- DIRECT MESSAGES: 1:1 friend-to-friend chat.
-- The `messages` table is event-scoped (event_id NOT NULL), so DMs get their
-- own table. A message can only be sent between two users who are accepted
-- friends; both participants can read the whole conversation.
-- Run this on the existing database (Supabase SQL editor or migration).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS direct_messages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  type         TEXT DEFAULT 'text' CHECK (type IN ('text')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CHECK (sender_id <> recipient_id)
);

-- Index both directions so fetching a conversation and the inbox are fast.
CREATE INDEX IF NOT EXISTS dm_pair_idx
  ON direct_messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dm_recipient_idx
  ON direct_messages (recipient_id, created_at DESC);

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- Either participant can read the conversation.
CREATE POLICY "dm_select" ON direct_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- You can only send as yourself, and only to an accepted friend.
CREATE POLICY "dm_insert" ON direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.requester_id = sender_id AND f.addressee_id = recipient_id)
          OR (f.requester_id = recipient_id AND f.addressee_id = sender_id)
        )
    )
  );

-- Live updates for incoming messages.
ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
