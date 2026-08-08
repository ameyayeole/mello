-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: four wrappable events for @iris, one per gate state.
--
-- Written to exercise the Phase 1 gate and the Phase 4 recap on a real device.
-- Re-runnable: it deletes its own events by id first, and everything else
-- cascades from events.id.
--
--   E1  ended  3h ago  size 4  need 2  contributors 0  iris has done nothing
--       -> LOCKED, "Finish 3 more steps to unlock"
--   E2  ended  9h ago  size 4  need 2  contributors 1  iris done
--       -> LOCKED, "Waiting on 1 more person"
--   E3  ended 26h ago  size 6  need 3  contributors 3  iris done, full content
--       -> OPEN, the whole recap
--   E4  ended 60h ago  size 4  need 2  contributors 1  iris done
--       -> UNLOCKABLE, "Only 1 of 2 contributed — open it anyway"
--
-- UUIDs are written out in full rather than bound to psql \set variables:
-- \set is a psql client meta-command and the Supabase SQL editor rejects it.
-- This file runs in both. Paste it whole into the editor, or:
--
--   npm run sql -- -f supabase/seed_iris_wrap.sql
--
-- ids, for reference:
--   iris  d7cb8567-d34a-4074-819a-4535218c1752   srishank e1f6eab6-…-9ce1e8d2c4fb
--   ameya b3ad436e-9427-4636-873f-e6ee14e1aabf   bliss    92eb7760-…-f4fd8964cfc2
--   airis a7e9359b-1902-4311-9b5a-9f2c8110279c   syntopic 623bac4b-…-d598c370638c
--   yeole 0a0e8d35-cc7f-401d-aee0-c54455ee7dd5
--
-- The three notification triggers are disabled for the duration. Seeding fires
-- photo_liked, photo_commented and wrap_unlocked at people who are real users
-- with real phones; the point here is the UI state, not the push. They are
-- re-enabled before COMMIT — and because the whole file is one transaction, an
-- error partway through restores them too.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Idempotent: drop anything a previous run left. Everything else cascades.
DELETE FROM events WHERE id IN (
  '1a15e001-0000-4000-8000-000000000001',
  '1a15e002-0000-4000-8000-000000000002',
  '1a15e003-0000-4000-8000-000000000003',
  '1a15e004-0000-4000-8000-000000000004'
);

ALTER TABLE photo_reactions      DISABLE TRIGGER photo_reactions_notify;
ALTER TABLE wrap_photo_comments  DISABLE TRIGGER on_wrap_photo_comment;
ALTER TABLE wrap_contributions   DISABLE TRIGGER wrap_contributions_unlock;

-- ── The events ───────────────────────────────────────────────────────────────
INSERT INTO events (id, host_id, activity, title, description, location,
                    location_name, starts_at, ends_at, max_people,
                    is_public, is_active, wrap_ready_notified,
                    wrap_unlocked_notified)
VALUES
  ('1a15e001-0000-4000-8000-000000000001',
   'd7cb8567-d34a-4074-819a-4535218c1752', 'drinks', 'Rooftop Sundowners',
   'Golden hour on the 42nd floor.',
   ST_SetSRID(ST_MakePoint(55.2708, 25.2048), 4326)::geography,
   'SLS Dubai, Business Bay',
   NOW() - INTERVAL '5 hours', NOW() - INTERVAL '3 hours', 8, TRUE, TRUE, TRUE, TRUE),

  ('1a15e002-0000-4000-8000-000000000002',
   'd7cb8567-d34a-4074-819a-4535218c1752', 'badminton', 'Padel & Pizza',
   'Two courts booked, pizza after.',
   ST_SetSRID(ST_MakePoint(55.2620, 25.1900), 4326)::geography,
   'Padel Pro, Al Quoz',
   NOW() - INTERVAL '11 hours', NOW() - INTERVAL '9 hours', 8, TRUE, TRUE, TRUE, TRUE),

  ('1a15e003-0000-4000-8000-000000000003',
   'd7cb8567-d34a-4074-819a-4535218c1752', 'camping', 'Desert Camp Night',
   'Dunes, a fire, and far too much food.',
   ST_SetSRID(ST_MakePoint(55.4200, 24.8000), 4326)::geography,
   'Al Faya Desert Retreat',
   NOW() - INTERVAL '30 hours', NOW() - INTERVAL '26 hours', 10, TRUE, TRUE, TRUE, TRUE),

  ('1a15e004-0000-4000-8000-000000000004',
   'd7cb8567-d34a-4074-819a-4535218c1752', 'brunch', 'Marina Brunch',
   'The long one. Bottomless everything.',
   ST_SetSRID(ST_MakePoint(55.1400, 25.0800), 4326)::geography,
   'Pier 7, Dubai Marina',
   NOW() - INTERVAL '63 hours', NOW() - INTERVAL '60 hours', 8, TRUE, TRUE, TRUE, TRUE);

-- ── Attendees. The host is an approved participant of their own event (043),
--    and get_wrap_gate sizes the event as 1 + approved participants <> host. ──
INSERT INTO event_participants (event_id, user_id, status, joined_at) VALUES
  ('1a15e001-0000-4000-8000-000000000001','d7cb8567-d34a-4074-819a-4535218c1752','approved', NOW() - INTERVAL '2 days'),
  ('1a15e001-0000-4000-8000-000000000001','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb','approved', NOW() - INTERVAL '2 days'),
  ('1a15e001-0000-4000-8000-000000000001','b3ad436e-9427-4636-873f-e6ee14e1aabf','approved', NOW() - INTERVAL '2 days'),
  ('1a15e001-0000-4000-8000-000000000001','92eb7760-5995-4f96-b705-f4fd8964cfc2','approved', NOW() - INTERVAL '2 days'),

  ('1a15e002-0000-4000-8000-000000000002','d7cb8567-d34a-4074-819a-4535218c1752','approved', NOW() - INTERVAL '2 days'),
  ('1a15e002-0000-4000-8000-000000000002','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb','approved', NOW() - INTERVAL '2 days'),
  ('1a15e002-0000-4000-8000-000000000002','b3ad436e-9427-4636-873f-e6ee14e1aabf','approved', NOW() - INTERVAL '2 days'),
  ('1a15e002-0000-4000-8000-000000000002','a7e9359b-1902-4311-9b5a-9f2c8110279c','approved', NOW() - INTERVAL '2 days'),

  ('1a15e003-0000-4000-8000-000000000003','d7cb8567-d34a-4074-819a-4535218c1752','approved', NOW() - INTERVAL '4 days'),
  ('1a15e003-0000-4000-8000-000000000003','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb','approved', NOW() - INTERVAL '4 days'),
  ('1a15e003-0000-4000-8000-000000000003','b3ad436e-9427-4636-873f-e6ee14e1aabf','approved', NOW() - INTERVAL '4 days'),
  ('1a15e003-0000-4000-8000-000000000003','92eb7760-5995-4f96-b705-f4fd8964cfc2','approved', NOW() - INTERVAL '4 days'),
  ('1a15e003-0000-4000-8000-000000000003','623bac4b-a20e-44d8-ba29-d598c370638c','approved', NOW() - INTERVAL '4 days'),
  ('1a15e003-0000-4000-8000-000000000003','0a0e8d35-cc7f-401d-aee0-c54455ee7dd5','approved', NOW() - INTERVAL '4 days'),

  ('1a15e004-0000-4000-8000-000000000004','d7cb8567-d34a-4074-819a-4535218c1752','approved', NOW() - INTERVAL '5 days'),
  ('1a15e004-0000-4000-8000-000000000004','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb','approved', NOW() - INTERVAL '5 days'),
  ('1a15e004-0000-4000-8000-000000000004','b3ad436e-9427-4636-873f-e6ee14e1aabf','approved', NOW() - INTERVAL '5 days'),
  ('1a15e004-0000-4000-8000-000000000004','0a0e8d35-cc7f-401d-aee0-c54455ee7dd5','approved', NOW() - INTERVAL '5 days')
ON CONFLICT (event_id, user_id) DO NOTHING;

-- ── E2: iris finishes her own three host steps, nobody else contributes ──────
INSERT INTO event_ratings (event_id, rater_id, ratee_id, rating) VALUES
  ('1a15e002-0000-4000-8000-000000000002','d7cb8567-d34a-4074-819a-4535218c1752','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb','up'),
  ('1a15e002-0000-4000-8000-000000000002','d7cb8567-d34a-4074-819a-4535218c1752','b3ad436e-9427-4636-873f-e6ee14e1aabf','up'),
  ('1a15e002-0000-4000-8000-000000000002','d7cb8567-d34a-4074-819a-4535218c1752','a7e9359b-1902-4311-9b5a-9f2c8110279c','up')
ON CONFLICT DO NOTHING;

INSERT INTO event_photos (id, event_id, uploader_id, url, caption) VALUES
  ('1a15f001-0000-4000-8000-000000000001','1a15e002-0000-4000-8000-000000000002',
   'd7cb8567-d34a-4074-819a-4535218c1752',
   'https://picsum.photos/seed/mello-padel/900/1200', 'Court 2 crew');

INSERT INTO superlative_votes (event_id, category, voter_id, votee_id) VALUES
  ('1a15e002-0000-4000-8000-000000000002','mvp',            'd7cb8567-d34a-4074-819a-4535218c1752','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb'),
  ('1a15e002-0000-4000-8000-000000000002','first_to_arrive','d7cb8567-d34a-4074-819a-4535218c1752','b3ad436e-9427-4636-873f-e6ee14e1aabf'),
  ('1a15e002-0000-4000-8000-000000000002','next_host',      'd7cb8567-d34a-4074-819a-4535218c1752','a7e9359b-1902-4311-9b5a-9f2c8110279c'),
  ('1a15e002-0000-4000-8000-000000000002','best_vibes',     'd7cb8567-d34a-4074-819a-4535218c1752','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb')
ON CONFLICT DO NOTHING;

INSERT INTO wrap_contributions (event_id, user_id) VALUES
  ('1a15e002-0000-4000-8000-000000000002','d7cb8567-d34a-4074-819a-4535218c1752')
ON CONFLICT DO NOTHING;

-- ── E4: same, but it ended 60h ago, so the 48h escape hatch is live ──────────
INSERT INTO event_ratings (event_id, rater_id, ratee_id, rating) VALUES
  ('1a15e004-0000-4000-8000-000000000004','d7cb8567-d34a-4074-819a-4535218c1752','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb','up'),
  ('1a15e004-0000-4000-8000-000000000004','d7cb8567-d34a-4074-819a-4535218c1752','b3ad436e-9427-4636-873f-e6ee14e1aabf','up'),
  ('1a15e004-0000-4000-8000-000000000004','d7cb8567-d34a-4074-819a-4535218c1752','0a0e8d35-cc7f-401d-aee0-c54455ee7dd5','down')
ON CONFLICT DO NOTHING;

INSERT INTO event_photos (id, event_id, uploader_id, url, caption) VALUES
  ('1a15f002-0000-4000-8000-000000000002','1a15e004-0000-4000-8000-000000000004',
   'd7cb8567-d34a-4074-819a-4535218c1752',
   'https://picsum.photos/seed/mello-brunch/900/1200', 'Four hours in');

INSERT INTO superlative_votes (event_id, category, voter_id, votee_id) VALUES
  ('1a15e004-0000-4000-8000-000000000004','mvp',            'd7cb8567-d34a-4074-819a-4535218c1752','b3ad436e-9427-4636-873f-e6ee14e1aabf'),
  ('1a15e004-0000-4000-8000-000000000004','first_to_arrive','d7cb8567-d34a-4074-819a-4535218c1752','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb'),
  ('1a15e004-0000-4000-8000-000000000004','next_host',      'd7cb8567-d34a-4074-819a-4535218c1752','0a0e8d35-cc7f-401d-aee0-c54455ee7dd5'),
  ('1a15e004-0000-4000-8000-000000000004','best_vibes',     'd7cb8567-d34a-4074-819a-4535218c1752','b3ad436e-9427-4636-873f-e6ee14e1aabf')
ON CONFLICT DO NOTHING;

INSERT INTO wrap_contributions (event_id, user_id) VALUES
  ('1a15e004-0000-4000-8000-000000000004','d7cb8567-d34a-4074-819a-4535218c1752')
ON CONFLICT DO NOTHING;

-- ── E3: the full one. Size 6 -> threshold 3, and 3 people contributed. ───────
INSERT INTO event_ratings (event_id, rater_id, ratee_id, rating) VALUES
  ('1a15e003-0000-4000-8000-000000000003','d7cb8567-d34a-4074-819a-4535218c1752','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb','up'),
  ('1a15e003-0000-4000-8000-000000000003','d7cb8567-d34a-4074-819a-4535218c1752','b3ad436e-9427-4636-873f-e6ee14e1aabf','up'),
  ('1a15e003-0000-4000-8000-000000000003','d7cb8567-d34a-4074-819a-4535218c1752','92eb7760-5995-4f96-b705-f4fd8964cfc2','up'),
  ('1a15e003-0000-4000-8000-000000000003','d7cb8567-d34a-4074-819a-4535218c1752','623bac4b-a20e-44d8-ba29-d598c370638c','up'),
  ('1a15e003-0000-4000-8000-000000000003','d7cb8567-d34a-4074-819a-4535218c1752','0a0e8d35-cc7f-401d-aee0-c54455ee7dd5','up'),
  -- thumbs coming back to iris — this is what the private half of the recap counts
  ('1a15e003-0000-4000-8000-000000000003','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb','d7cb8567-d34a-4074-819a-4535218c1752','up'),
  ('1a15e003-0000-4000-8000-000000000003','b3ad436e-9427-4636-873f-e6ee14e1aabf','d7cb8567-d34a-4074-819a-4535218c1752','up'),
  ('1a15e003-0000-4000-8000-000000000003','92eb7760-5995-4f96-b705-f4fd8964cfc2','d7cb8567-d34a-4074-819a-4535218c1752','up'),
  ('1a15e003-0000-4000-8000-000000000003','623bac4b-a20e-44d8-ba29-d598c370638c','d7cb8567-d34a-4074-819a-4535218c1752','up'),
  ('1a15e003-0000-4000-8000-000000000003','0a0e8d35-cc7f-401d-aee0-c54455ee7dd5','d7cb8567-d34a-4074-819a-4535218c1752','up')
ON CONFLICT DO NOTHING;

INSERT INTO event_photos (id, event_id, uploader_id, url, caption) VALUES
  ('1a15f003-0000-4000-8000-000000000003','1a15e003-0000-4000-8000-000000000003',
   'd7cb8567-d34a-4074-819a-4535218c1752',
   'https://picsum.photos/seed/mello-dunes/900/1200', 'The dunes at blue hour'),
  ('1a15f004-0000-4000-8000-000000000004','1a15e003-0000-4000-8000-000000000003',
   'e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb',
   'https://picsum.photos/seed/mello-fire/900/1200', 'Fire finally caught'),
  ('1a15f005-0000-4000-8000-000000000005','1a15e003-0000-4000-8000-000000000003',
   'b3ad436e-9427-4636-873f-e6ee14e1aabf',
   'https://picsum.photos/seed/mello-tents/900/1200', 'Camp set up before dark');

-- All four tapbacks represented; one reaction per person per photo (077's
-- unique index would reject a second).
INSERT INTO photo_reactions (photo_id, user_id, emoji) VALUES
  ('1a15f003-0000-4000-8000-000000000003','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb','❤️'),
  ('1a15f003-0000-4000-8000-000000000003','b3ad436e-9427-4636-873f-e6ee14e1aabf','❤️'),
  ('1a15f003-0000-4000-8000-000000000003','92eb7760-5995-4f96-b705-f4fd8964cfc2','😂'),
  ('1a15f003-0000-4000-8000-000000000003','623bac4b-a20e-44d8-ba29-d598c370638c','👍'),
  ('1a15f004-0000-4000-8000-000000000004','d7cb8567-d34a-4074-819a-4535218c1752','❤️'),
  ('1a15f004-0000-4000-8000-000000000004','b3ad436e-9427-4636-873f-e6ee14e1aabf','👍'),
  ('1a15f004-0000-4000-8000-000000000004','0a0e8d35-cc7f-401d-aee0-c54455ee7dd5','❤️'),
  ('1a15f005-0000-4000-8000-000000000005','d7cb8567-d34a-4074-819a-4535218c1752','😂'),
  ('1a15f005-0000-4000-8000-000000000005','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb','👍')
ON CONFLICT DO NOTHING;

-- A real thread: two comments from the same person, which the old composite
-- primary key made impossible.
INSERT INTO wrap_photo_comments (photo_id, user_id, content) VALUES
  ('1a15f003-0000-4000-8000-000000000003','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb','this is unreal'),
  ('1a15f003-0000-4000-8000-000000000003','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb','sending me the full res one?'),
  ('1a15f003-0000-4000-8000-000000000003','d7cb8567-d34a-4074-819a-4535218c1752','will do when I am back on wifi'),
  ('1a15f004-0000-4000-8000-000000000004','b3ad436e-9427-4636-873f-e6ee14e1aabf','took us 40 minutes lol');

-- 3+ votes per category so every award has a decided winner (033 needs 3).
INSERT INTO superlative_votes (event_id, category, voter_id, votee_id) VALUES
  ('1a15e003-0000-4000-8000-000000000003','mvp',            'd7cb8567-d34a-4074-819a-4535218c1752','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb'),
  ('1a15e003-0000-4000-8000-000000000003','mvp',            'e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb','d7cb8567-d34a-4074-819a-4535218c1752'),
  ('1a15e003-0000-4000-8000-000000000003','mvp',            'b3ad436e-9427-4636-873f-e6ee14e1aabf','d7cb8567-d34a-4074-819a-4535218c1752'),
  ('1a15e003-0000-4000-8000-000000000003','mvp',            '92eb7760-5995-4f96-b705-f4fd8964cfc2','d7cb8567-d34a-4074-819a-4535218c1752'),
  ('1a15e003-0000-4000-8000-000000000003','first_to_arrive','d7cb8567-d34a-4074-819a-4535218c1752','b3ad436e-9427-4636-873f-e6ee14e1aabf'),
  ('1a15e003-0000-4000-8000-000000000003','first_to_arrive','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb','b3ad436e-9427-4636-873f-e6ee14e1aabf'),
  -- not b3ad… for himself: superlative_votes_check forbids voting for
  -- yourself. Two of these three still land on ameya, so he wins the category.
  ('1a15e003-0000-4000-8000-000000000003','first_to_arrive','b3ad436e-9427-4636-873f-e6ee14e1aabf','92eb7760-5995-4f96-b705-f4fd8964cfc2'),
  ('1a15e003-0000-4000-8000-000000000003','next_host',      'd7cb8567-d34a-4074-819a-4535218c1752','92eb7760-5995-4f96-b705-f4fd8964cfc2'),
  ('1a15e003-0000-4000-8000-000000000003','next_host',      'e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb','92eb7760-5995-4f96-b705-f4fd8964cfc2'),
  ('1a15e003-0000-4000-8000-000000000003','next_host',      'b3ad436e-9427-4636-873f-e6ee14e1aabf','92eb7760-5995-4f96-b705-f4fd8964cfc2'),
  ('1a15e003-0000-4000-8000-000000000003','best_vibes',     'd7cb8567-d34a-4074-819a-4535218c1752','623bac4b-a20e-44d8-ba29-d598c370638c'),
  ('1a15e003-0000-4000-8000-000000000003','best_vibes',     'e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb','d7cb8567-d34a-4074-819a-4535218c1752'),
  ('1a15e003-0000-4000-8000-000000000003','best_vibes',     'b3ad436e-9427-4636-873f-e6ee14e1aabf','d7cb8567-d34a-4074-819a-4535218c1752'),
  ('1a15e003-0000-4000-8000-000000000003','best_vibes',     '92eb7760-5995-4f96-b705-f4fd8964cfc2','d7cb8567-d34a-4074-819a-4535218c1752')
ON CONFLICT DO NOTHING;

-- Notes land in the private half of the recap. One sealed, one already opened.
INSERT INTO wrap_notes (event_id, sender_id, recipient_id, content, opened_at) VALUES
  ('1a15e003-0000-4000-8000-000000000003','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb',
   'd7cb8567-d34a-4074-819a-4535218c1752','You made that whole night happen. Thank you.', NULL),
  ('1a15e003-0000-4000-8000-000000000003','b3ad436e-9427-4636-873f-e6ee14e1aabf',
   'd7cb8567-d34a-4074-819a-4535218c1752','Best plan of the year, easily.', NOW() - INTERVAL '4 hours');

INSERT INTO encore_requests (event_id, user_id) VALUES
  ('1a15e003-0000-4000-8000-000000000003','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb'),
  ('1a15e003-0000-4000-8000-000000000003','b3ad436e-9427-4636-873f-e6ee14e1aabf'),
  ('1a15e003-0000-4000-8000-000000000003','92eb7760-5995-4f96-b705-f4fd8964cfc2'),
  ('1a15e003-0000-4000-8000-000000000003','623bac4b-a20e-44d8-ba29-d598c370638c')
ON CONFLICT DO NOTHING;

-- Threshold is 3; exactly 3 contributed.
INSERT INTO wrap_contributions (event_id, user_id) VALUES
  ('1a15e003-0000-4000-8000-000000000003','d7cb8567-d34a-4074-819a-4535218c1752'),
  ('1a15e003-0000-4000-8000-000000000003','e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb'),
  ('1a15e003-0000-4000-8000-000000000003','b3ad436e-9427-4636-873f-e6ee14e1aabf')
ON CONFLICT DO NOTHING;

ALTER TABLE photo_reactions      ENABLE TRIGGER photo_reactions_notify;
ALTER TABLE wrap_photo_comments  ENABLE TRIGGER on_wrap_photo_comment;
ALTER TABLE wrap_contributions   ENABLE TRIGGER wrap_contributions_unlock;

COMMIT;
