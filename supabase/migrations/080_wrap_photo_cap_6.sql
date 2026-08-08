-- ─────────────────────────────────────────────────────────────────────────────
-- PHOTO CAP: 4 -> 6 per uploader per event.
--
-- The cap is a BEFORE INSERT trigger from migration 032, not a client rule, so
-- raising MAX_PHOTOS in the app alone does nothing except move where the failure
-- happens: the picker lets you choose six, the uploads run one at a time, and
-- the fifth one raises 'photo limit reached (4 per event)' after four have
-- already landed. That is what device testing hit on 2026-08-08.
--
-- Six, matching the number of photos the wrap surfaces downstream carry.
--
-- Run this whole file in the Supabase SQL editor. It only replaces a function —
-- the trigger already points at it and does not need recreating, but it is
-- recreated anyway so this file is safe to run on a database that never had 032.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION enforce_photo_cap()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM event_photos
      WHERE event_id = NEW.event_id AND uploader_id = NEW.uploader_id) >= 6 THEN
    RAISE EXCEPTION 'photo limit reached (6 per event)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_photo_cap ON event_photos;
CREATE TRIGGER enforce_photo_cap
  BEFORE INSERT ON event_photos
  FOR EACH ROW EXECUTE FUNCTION enforce_photo_cap();
