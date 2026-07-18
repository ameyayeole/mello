-- 030: Chat features — pin/mute/delete chat, pinned messages, images in chat,
-- host announcements + controls (lock chat, delete any message), @mention
-- notifications, and a 7-day post-event chat purge.
-- Requires 029_usernames.sql. Run this whole file in the Supabase SQL editor.

-- ─── NEW NOTIFICATION TYPES ──────────────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'host_announcement';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'mention';

-- ─── PER-USER CONVERSATION PREFS (pin / mute / delete chat) ──────────────────
CREATE TABLE IF NOT EXISTS chat_prefs (
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chat_type  TEXT NOT NULL CHECK (chat_type IN ('event', 'dm')),
  -- The event id, or (for DMs) the other person's profile id.
  chat_id    UUID NOT NULL,
  pinned_at  TIMESTAMPTZ,
  muted      BOOLEAN NOT NULL DEFAULT FALSE,
  -- "Delete chat" (hide for me): conversations whose last activity is at or
  -- before this timestamp are hidden from the inbox and their earlier history
  -- is hidden in the thread. A newer message makes the chat reappear.
  cleared_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, chat_type, chat_id)
);

ALTER TABLE chat_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_prefs_all" ON chat_prefs;
CREATE POLICY "chat_prefs_all" ON chat_prefs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── MESSAGE TYPES: image + announcement ─────────────────────────────────────
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_type_check
  CHECK (type IN ('text', 'system', 'location', 'image', 'announcement'));

ALTER TABLE direct_messages DROP CONSTRAINT IF EXISTS direct_messages_type_check;
ALTER TABLE direct_messages ADD CONSTRAINT direct_messages_type_check
  CHECK (type IN ('text', 'image'));

-- ─── EVENTS: chat lock + pinned message ──────────────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS chat_locked BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- ─── DM PINNED MESSAGES ──────────────────────────────────────────────────────
-- One pinned message per DM conversation. pair_key = 'least:greatest' of the
-- two profile ids (computed client-side).
CREATE TABLE IF NOT EXISTS dm_pins (
  pair_key   TEXT PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
  pinned_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pinned_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dm_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dm_pins_all" ON dm_pins;
CREATE POLICY "dm_pins_all" ON dm_pins
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM direct_messages dm
      WHERE dm.id = message_id
        AND (dm.sender_id = auth.uid() OR dm.recipient_id = auth.uid())
    )
  )
  WITH CHECK (
    pinned_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM direct_messages dm
      WHERE dm.id = message_id
        AND (dm.sender_id = auth.uid() OR dm.recipient_id = auth.uid())
    )
  );

-- ─── MESSAGE DELETION + CHAT LOCK (RLS) ──────────────────────────────────────
-- Delete: your own message, or any message in an event you host.
DROP POLICY IF EXISTS "messages_delete" ON messages;
CREATE POLICY "messages_delete" ON messages
  FOR DELETE TO authenticated
  USING (
    sender_id = auth.uid()
    OR event_id IN (SELECT id FROM events WHERE host_id = auth.uid())
  );

DROP POLICY IF EXISTS "direct_messages_delete" ON direct_messages;
CREATE POLICY "direct_messages_delete" ON direct_messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

-- Insert: same participant/host rule as 003, plus non-hosts are blocked while
-- the host has locked the chat.
DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      event_id IN (SELECT id FROM events WHERE host_id = auth.uid())
      OR (
        event_id IN (SELECT event_id FROM event_participants WHERE user_id = auth.uid())
        AND NOT COALESCE((SELECT chat_locked FROM events WHERE id = event_id), FALSE)
      )
    )
  );

-- Realtime DELETE payloads only carry the primary key under the default
-- replica identity; FULL lets the client's event_id-filtered subscriptions
-- receive them.
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE direct_messages REPLICA IDENTITY FULL;

-- ─── NOTIFICATION TRIGGERS (rewrites of 023) ─────────────────────────────────
-- Event chat messages. Precedence per recipient:
--   system/announcement → handled elsewhere
--   @mentioned          → 'mention' (ignores mute)
--   otherwise           → 'new_message' unless the recipient muted this chat
CREATE OR REPLACE FUNCTION on_event_message()
RETURNS TRIGGER AS $$
DECLARE
  ev_title TEXT;
BEGIN
  IF NEW.type IN ('system', 'announcement') THEN
    RETURN NEW;
  END IF;

  SELECT title INTO ev_title FROM events WHERE id = NEW.event_id;

  WITH tokens AS (
    SELECT DISTINCT lower(m[1]) AS uname
    FROM regexp_matches(NEW.content, '@([a-zA-Z0-9._]+)', 'g') m
  ),
  members AS (
    SELECT ep.user_id AS uid
      FROM event_participants ep
      WHERE ep.event_id = NEW.event_id AND ep.status = 'approved'
    UNION
    SELECT ev.host_id FROM events ev WHERE ev.id = NEW.event_id
  ),
  mentioned AS (
    SELECT p.id AS uid
    FROM profiles p
    JOIN tokens t ON lower(p.username) = t.uname
    JOIN members mem ON mem.uid = p.id
    WHERE p.id <> NEW.sender_id
  )
  INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
  SELECT DISTINCT
    m.uid,
    NEW.sender_id,
    CASE WHEN mn.uid IS NOT NULL THEN 'mention'::notification_type
         ELSE 'new_message'::notification_type END,
    NEW.event_id,
    jsonb_build_object('kind', 'event_message', 'eventTitle', ev_title)
  FROM members m
  LEFT JOIN mentioned mn ON mn.uid = m.uid
  WHERE m.uid <> NEW.sender_id
    AND (
      mn.uid IS NOT NULL  -- mentions always get through
      OR NOT EXISTS (
        SELECT 1 FROM chat_prefs cp
        WHERE cp.user_id = m.uid
          AND cp.chat_type = 'event'
          AND cp.chat_id = NEW.event_id
          AND cp.muted
      )
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_event_message ON messages;
CREATE TRIGGER on_event_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION on_event_message();

-- Direct messages: mention beats mute; otherwise mute wins.
CREATE OR REPLACE FUNCTION on_direct_message()
RETURNS TRIGGER AS $$
DECLARE
  is_mention BOOLEAN;
  is_muted BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM regexp_matches(NEW.content, '@([a-zA-Z0-9._]+)', 'g') m
    JOIN profiles p ON lower(p.username) = lower(m[1])
    WHERE p.id = NEW.recipient_id
  ) INTO is_mention;

  SELECT EXISTS (
    SELECT 1 FROM chat_prefs cp
    WHERE cp.user_id = NEW.recipient_id
      AND cp.chat_type = 'dm'
      AND cp.chat_id = NEW.sender_id
      AND cp.muted
  ) INTO is_muted;

  IF is_muted AND NOT is_mention THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
  VALUES (
    NEW.recipient_id,
    NEW.sender_id,
    CASE WHEN is_mention THEN 'mention'::notification_type
         ELSE 'new_message'::notification_type END,
    NULL,
    jsonb_build_object('kind', 'dm', 'friendId', NEW.sender_id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_direct_message ON direct_messages;
CREATE TRIGGER on_direct_message
  AFTER INSERT ON direct_messages
  FOR EACH ROW EXECUTE FUNCTION on_direct_message();

-- ─── HOST ANNOUNCEMENTS ──────────────────────────────────────────────────────
-- Host-only; auto-pins itself and notifies every approved participant,
-- bypassing mute.
CREATE OR REPLACE FUNCTION on_announcement()
RETURNS TRIGGER AS $$
DECLARE
  ev RECORD;
BEGIN
  IF NEW.type <> 'announcement' THEN
    RETURN NEW;
  END IF;

  SELECT id, host_id, title INTO ev FROM events WHERE id = NEW.event_id;
  IF ev.host_id IS DISTINCT FROM NEW.sender_id THEN
    RAISE EXCEPTION 'Only the host can send announcements';
  END IF;

  UPDATE events SET pinned_message_id = NEW.id WHERE id = NEW.event_id;

  INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
  SELECT DISTINCT ep.user_id, NEW.sender_id, 'host_announcement', NEW.event_id,
         jsonb_build_object('eventTitle', ev.title, 'preview', left(NEW.content, 120))
  FROM event_participants ep
  WHERE ep.event_id = NEW.event_id
    AND ep.status = 'approved'
    AND ep.user_id <> NEW.sender_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_announcement ON messages;
CREATE TRIGGER on_announcement
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION on_announcement();

-- ─── 7-DAY POST-EVENT CHAT PURGE (pg_cron) ───────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('purge-old-event-chats');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'purge-old-event-chats',
  '0 3 * * *',
  $$DELETE FROM messages m
    USING events e
    WHERE m.event_id = e.id
      AND COALESCE(e.ends_at, e.starts_at) < NOW() - INTERVAL '7 days'$$
);

-- ─── CHAT MEDIA STORAGE ──────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read for chat media" ON storage.objects;
CREATE POLICY "Public read for chat media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "Users upload chat media to own folder" ON storage.objects;
CREATE POLICY "Users upload chat media to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own chat media" ON storage.objects;
CREATE POLICY "Users delete own chat media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
