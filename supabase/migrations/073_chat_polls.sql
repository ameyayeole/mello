-- ─────────────────────────────────────────────────────────────────────────────
-- 073: Polls in an event chat. "Which bar?", answered in the thread.
--
-- Deliberately its own tables rather than an extension of the community's polls
-- (058), and the reason is RLS, not shape. That poll is owned by a *post* —
-- `polls.post_id` is its primary key, and every policy on it reads "iff you can
-- see the post". A chat poll is owned by a *message* in an event, and every
-- policy reads "iff you are in that event". Making 058's tables polymorphic
-- would mean rewriting the primary key of a live table, and then writing both
-- sets of rules into every policy with a null check to pick between them. Two
-- owners, two sets of rules; the shape being similar is not a reason to share
-- the table.
--
-- What IS shared is the shape and the vocabulary — same columns, same
-- trigger-maintained `vote_count`, same UNIQUE (poll, user) as the real
-- one-vote guard, same insert-only votes so a cast is locked. A reader who
-- knows 058 knows this. The client shares the rendering, which is the part a
-- user sees.
--
-- Anonymity works the same way: you may read only your OWN vote row, everyone
-- reads the aggregate counts.
--
-- No `closes_at` and no cron. A chat poll closes when the conversation moves on
-- — a timer would need a notification, a "final" state and a job, for a poll
-- that is three messages up the thread by then. Deleting the message deletes
-- the poll with it (ON DELETE CASCADE), which is the only end it needs.
--
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- The message carrying a poll is type='poll'; its `content` holds the question,
-- so every existing surface that shows a message preview (the Inbox row, the
-- pinned banner, a reply quote, a push notification) shows the question with no
-- further work.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_type_check
  CHECK (type IN ('text', 'system', 'location', 'image', 'announcement', 'poll'));

CREATE TABLE IF NOT EXISTS message_polls (
  message_id UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_poll_options (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id    UUID NOT NULL REFERENCES message_polls(message_id) ON DELETE CASCADE,
  idx        INT  NOT NULL,           -- 0-based display order
  label      TEXT NOT NULL,
  vote_count INT  NOT NULL DEFAULT 0,
  UNIQUE (poll_id, idx)
);
CREATE INDEX IF NOT EXISTS message_poll_options_poll_idx
  ON message_poll_options (poll_id);

CREATE TABLE IF NOT EXISTS message_poll_votes (
  poll_id    UUID NOT NULL REFERENCES message_polls(message_id) ON DELETE CASCADE,
  option_id  UUID NOT NULL REFERENCES message_poll_options(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (poll_id, user_id)      -- one vote per person per poll
);
CREATE INDEX IF NOT EXISTS message_poll_votes_option_idx
  ON message_poll_votes (option_id);

ALTER TABLE message_polls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_poll_votes   ENABLE ROW LEVEL SECURITY;

-- ─── Who can see a poll ──────────────────────────────────────────────────────
-- Whoever can see the message it hangs off, which for an event chat means an
-- approved participant or the host (`is_event_attendee`, 032/043).

CREATE OR REPLACE FUNCTION can_see_message(p_message_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = p_message_id
      AND is_event_attendee(m.event_id, auth.uid())
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

DROP POLICY IF EXISTS "message_polls_select" ON message_polls;
CREATE POLICY "message_polls_select" ON message_polls
  FOR SELECT TO authenticated USING (can_see_message(message_id));

DROP POLICY IF EXISTS "message_poll_options_select" ON message_poll_options;
CREATE POLICY "message_poll_options_select" ON message_poll_options
  FOR SELECT TO authenticated USING (can_see_message(poll_id));

-- ─── Who can create one ──────────────────────────────────────────────────────
-- The message's own sender, and only for a message they just sent. The client
-- inserts the message first and the poll second; this is what stops a third
-- party attaching a poll to someone else's message.

DROP POLICY IF EXISTS "message_polls_insert" ON message_polls;
CREATE POLICY "message_polls_insert" ON message_polls
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM messages m
      WHERE m.id = message_id AND m.sender_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "message_poll_options_insert" ON message_poll_options;
CREATE POLICY "message_poll_options_insert" ON message_poll_options
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM messages m
      WHERE m.id = poll_id AND m.sender_id = auth.uid()
    )
  );

-- ─── Voting ──────────────────────────────────────────────────────────────────
-- Your own vote, on a poll you can see, for an option that belongs to it. No
-- UPDATE and no DELETE policy, so a cast is final — the same rule as 058, and
-- the reason the client shows results the moment you have voted.

DROP POLICY IF EXISTS "message_poll_votes_select_own" ON message_poll_votes;
CREATE POLICY "message_poll_votes_select_own" ON message_poll_votes
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "message_poll_votes_insert" ON message_poll_votes;
CREATE POLICY "message_poll_votes_insert" ON message_poll_votes
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND can_see_message(poll_id)
    AND option_id IN (
      SELECT id FROM message_poll_options WHERE poll_id = message_poll_votes.poll_id
    )
  );

-- vote_count maintenance. Insert-only, because votes are immutable.
CREATE OR REPLACE FUNCTION on_message_poll_vote()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE message_poll_options
     SET vote_count = vote_count + 1
   WHERE id = NEW.option_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_message_poll_vote ON message_poll_votes;
CREATE TRIGGER on_message_poll_vote
  AFTER INSERT ON message_poll_votes
  FOR EACH ROW EXECUTE FUNCTION on_message_poll_vote();

-- Live results need the votes table on the realtime publication; the options
-- table carries the counts the clients actually render.
ALTER PUBLICATION supabase_realtime ADD TABLE message_poll_options;
