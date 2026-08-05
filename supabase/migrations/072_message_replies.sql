-- ─────────────────────────────────────────────────────────────────────────────
-- 072: Replies. Quote a message and answer it, in both the event chat and DMs.
--
-- Three columns, and two of them are denormalised on purpose:
--
--   reply_to_id       the link. What "jump to the message this replies to" uses,
--                     and null once the original is deleted.
--   reply_preview     the quoted text as it read when the reply was sent,
--                     already truncated by the client. '[photo]' for an image.
--   reply_sender_name who was quoted, at the time of quoting.
--
-- The snapshot is what makes a reply arriving over realtime renderable. A
-- postgres_changes payload carries the row and nothing else — no joins, no
-- embedded resources — so a quote that lived only in `reply_to_id` would arrive
-- as an id the thread has to resolve, and it cannot always: the original may be
-- older than the fifty messages the thread loaded. The quote would come up empty
-- and fill in only on the next refetch.
--
-- It also means a reply still reads correctly after the message it quotes is
-- deleted, which is the behaviour WhatsApp has. ON DELETE SET NULL keeps the
-- reply and drops only the link.
--
-- No RLS changes. Both tables' policies are row-scoped — by event membership,
-- and by sender/recipient — and a reply is an ordinary row of the same table: it
-- is readable exactly when the thread it is in is readable. The snapshot is
-- written by the sender, who could read the original in order to quote it.
--
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_preview TEXT,
  ADD COLUMN IF NOT EXISTS reply_sender_name TEXT;

ALTER TABLE direct_messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES direct_messages (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_preview TEXT,
  ADD COLUMN IF NOT EXISTS reply_sender_name TEXT;

-- The FK's own lookups when a quoted message is deleted. Partial, because the
-- column is null on the overwhelming majority of rows.
CREATE INDEX IF NOT EXISTS messages_reply_to_id_idx
  ON messages (reply_to_id)
  WHERE reply_to_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS direct_messages_reply_to_id_idx
  ON direct_messages (reply_to_id)
  WHERE reply_to_id IS NOT NULL;
