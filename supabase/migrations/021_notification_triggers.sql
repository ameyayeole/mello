-- ─────────────────────────────────────────────────────────────────────────────
-- NOTIFICATIONS: friend request / friend accepted triggers + push fan-out.
-- Join request / join approved triggers already exist (007_host_approval.sql).
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. New notification type for "your friend request was accepted"
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'friend_accepted';

-- 2. Notify the addressee when someone sends them a friend request
CREATE OR REPLACE FUNCTION on_friend_request()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    INSERT INTO notifications (recipient_id, sender_id, type)
    VALUES (NEW.addressee_id, NEW.requester_id, 'friend_request');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_friend_request ON friendships;
CREATE TRIGGER on_friend_request
  AFTER INSERT ON friendships
  FOR EACH ROW EXECUTE FUNCTION on_friend_request();

-- 3. Notify the requester when their friend request is accepted
CREATE OR REPLACE FUNCTION on_friend_accepted()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO notifications (recipient_id, sender_id, type)
    VALUES (NEW.requester_id, NEW.addressee_id, 'friend_accepted');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_friend_accepted_notify ON friendships;
CREATE TRIGGER on_friend_accepted_notify
  AFTER UPDATE ON friendships
  FOR EACH ROW EXECUTE FUNCTION on_friend_accepted();

-- 4. Push fan-out: every in-app notification row also calls the
--    send-push-notification Edge Function (best-effort, async via pg_net).
--    The Edge Function looks up the recipient's Expo push token and composes
--    the message copy from the record.
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION push_notification_fanout()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://vtrsagvueljzbbtpeenu.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_-DZwjVLqXcAY7GL--bzZ_Q_PmM76PTQ',
      'Authorization', 'Bearer sb_publishable_-DZwjVLqXcAY7GL--bzZ_Q_PmM76PTQ'
    ),
    body := jsonb_build_object('record', to_jsonb(NEW))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Push is best-effort; never block the notification insert.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_notification_push ON notifications;
CREATE TRIGGER on_notification_push
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION push_notification_fanout();
