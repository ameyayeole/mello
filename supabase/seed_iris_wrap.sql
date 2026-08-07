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
-- The three notification triggers are disabled for the duration. Seeding fires
-- photo_liked, photo_commented and wrap_unlocked at people who are real users
-- with real phones; the point here is the UI state, not the push. They are
-- re-enabled before COMMIT. Run with:
--
--   npm run sql -- --single-transaction supabase/seed_iris_wrap.sql
-- ─────────────────────────────────────────────────────────────────────────────

\set iris    '''d7cb8567-d34a-4074-819a-4535218c1752'''
\set sri     '''e1f6eab6-e2be-4328-b72f-9ce1e8d2c4fb'''
\set ameya   '''b3ad436e-9427-4636-873f-e6ee14e1aabf'''
\set bliss   '''92eb7760-5995-4f96-b705-f4fd8964cfc2'''
\set airis   '''a7e9359b-1902-4311-9b5a-9f2c8110279c'''
\set synt    '''623bac4b-a20e-44d8-ba29-d598c370638c'''
\set yeole   '''0a0e8d35-cc7f-401d-aee0-c54455ee7dd5'''

\set e1 '''1a15e001-0000-4000-8000-000000000001'''
\set e2 '''1a15e002-0000-4000-8000-000000000002'''
\set e3 '''1a15e003-0000-4000-8000-000000000003'''
\set e4 '''1a15e004-0000-4000-8000-000000000004'''

\set p1 '''1a15f001-0000-4000-8000-000000000001'''
\set p2 '''1a15f002-0000-4000-8000-000000000002'''
\set p3 '''1a15f003-0000-4000-8000-000000000003'''
\set p4 '''1a15f004-0000-4000-8000-000000000004'''
\set p5 '''1a15f005-0000-4000-8000-000000000005'''

-- Idempotent: drop anything a previous run left. Everything else cascades.
DELETE FROM events WHERE id IN (:e1, :e2, :e3, :e4);

ALTER TABLE photo_reactions      DISABLE TRIGGER photo_reactions_notify;
ALTER TABLE wrap_photo_comments  DISABLE TRIGGER on_wrap_photo_comment;
ALTER TABLE wrap_contributions   DISABLE TRIGGER wrap_contributions_unlock;

-- ── The events ───────────────────────────────────────────────────────────────
INSERT INTO events (id, host_id, activity, title, description, location,
                    location_name, starts_at, ends_at, max_people,
                    is_public, is_active, wrap_ready_notified,
                    wrap_unlocked_notified)
VALUES
  (:e1, :iris, 'drinks', 'Rooftop Sundowners',
   'Golden hour on the 42nd floor.',
   ST_SetSRID(ST_MakePoint(55.2708, 25.2048), 4326)::geography,
   'SLS Dubai, Business Bay',
   NOW() - INTERVAL '5 hours', NOW() - INTERVAL '3 hours', 8, TRUE, TRUE, TRUE, TRUE),

  (:e2, :iris, 'badminton', 'Padel & Pizza',
   'Two courts booked, pizza after.',
   ST_SetSRID(ST_MakePoint(55.2620, 25.1900), 4326)::geography,
   'Padel Pro, Al Quoz',
   NOW() - INTERVAL '11 hours', NOW() - INTERVAL '9 hours', 8, TRUE, TRUE, TRUE, TRUE),

  (:e3, :iris, 'camping', 'Desert Camp Night',
   'Dunes, a fire, and far too much food.',
   ST_SetSRID(ST_MakePoint(55.4200, 24.8000), 4326)::geography,
   'Al Faya Desert Retreat',
   NOW() - INTERVAL '30 hours', NOW() - INTERVAL '26 hours', 10, TRUE, TRUE, TRUE, TRUE),

  (:e4, :iris, 'brunch', 'Marina Brunch',
   'The long one. Bottomless everything.',
   ST_SetSRID(ST_MakePoint(55.1400, 25.0800), 4326)::geography,
   'Pier 7, Dubai Marina',
   NOW() - INTERVAL '63 hours', NOW() - INTERVAL '60 hours', 8, TRUE, TRUE, TRUE, TRUE);

-- ── Attendees. The host is an approved participant of their own event (043),
--    and get_wrap_gate sizes the event as 1 + approved participants <> host. ──
INSERT INTO event_participants (event_id, user_id, status, joined_at) VALUES
  (:e1, :iris, 'approved', NOW() - INTERVAL '2 days'),
  (:e1, :sri,  'approved', NOW() - INTERVAL '2 days'),
  (:e1, :ameya,'approved', NOW() - INTERVAL '2 days'),
  (:e1, :bliss,'approved', NOW() - INTERVAL '2 days'),

  (:e2, :iris, 'approved', NOW() - INTERVAL '2 days'),
  (:e2, :sri,  'approved', NOW() - INTERVAL '2 days'),
  (:e2, :ameya,'approved', NOW() - INTERVAL '2 days'),
  (:e2, :airis,'approved', NOW() - INTERVAL '2 days'),

  (:e3, :iris, 'approved', NOW() - INTERVAL '4 days'),
  (:e3, :sri,  'approved', NOW() - INTERVAL '4 days'),
  (:e3, :ameya,'approved', NOW() - INTERVAL '4 days'),
  (:e3, :bliss,'approved', NOW() - INTERVAL '4 days'),
  (:e3, :synt, 'approved', NOW() - INTERVAL '4 days'),
  (:e3, :yeole,'approved', NOW() - INTERVAL '4 days'),

  (:e4, :iris, 'approved', NOW() - INTERVAL '5 days'),
  (:e4, :sri,  'approved', NOW() - INTERVAL '5 days'),
  (:e4, :ameya,'approved', NOW() - INTERVAL '5 days'),
  (:e4, :yeole,'approved', NOW() - INTERVAL '5 days');

-- ── E2: iris finishes her own three host steps, nobody else contributes ──────
INSERT INTO event_ratings (event_id, rater_id, ratee_id, rating) VALUES
  (:e2, :iris, :sri,  'up'),
  (:e2, :iris, :ameya,'up'),
  (:e2, :iris, :airis,'up');
INSERT INTO event_photos (id, event_id, uploader_id, url, caption) VALUES
  (:p1, :e2, :iris, 'https://picsum.photos/seed/mello-padel/900/1200', 'Court 2 crew');
INSERT INTO superlative_votes (event_id, category, voter_id, votee_id) VALUES
  (:e2, 'mvp',             :iris, :sri),
  (:e2, 'first_to_arrive', :iris, :ameya),
  (:e2, 'next_host',       :iris, :airis),
  (:e2, 'best_vibes',      :iris, :sri);
INSERT INTO wrap_contributions (event_id, user_id) VALUES (:e2, :iris);

-- ── E4: same, but it ended 60h ago, so the 48h escape hatch is live ──────────
INSERT INTO event_ratings (event_id, rater_id, ratee_id, rating) VALUES
  (:e4, :iris, :sri,  'up'),
  (:e4, :iris, :ameya,'up'),
  (:e4, :iris, :yeole,'down');
INSERT INTO event_photos (id, event_id, uploader_id, url, caption) VALUES
  (:p2, :e4, :iris, 'https://picsum.photos/seed/mello-brunch/900/1200', 'Four hours in');
INSERT INTO superlative_votes (event_id, category, voter_id, votee_id) VALUES
  (:e4, 'mvp',             :iris, :ameya),
  (:e4, 'first_to_arrive', :iris, :sri),
  (:e4, 'next_host',       :iris, :yeole),
  (:e4, 'best_vibes',      :iris, :ameya);
INSERT INTO wrap_contributions (event_id, user_id) VALUES (:e4, :iris);

-- ── E3: the full one. Size 6 -> threshold 3, and 3 people contributed. ───────
INSERT INTO event_ratings (event_id, rater_id, ratee_id, rating) VALUES
  (:e3, :iris,  :sri,   'up'),
  (:e3, :iris,  :ameya, 'up'),
  (:e3, :iris,  :bliss, 'up'),
  (:e3, :iris,  :synt,  'up'),
  (:e3, :iris,  :yeole, 'up'),
  -- thumbs coming back to iris — this is what the private half counts
  (:e3, :sri,   :iris,  'up'),
  (:e3, :ameya, :iris,  'up'),
  (:e3, :bliss, :iris,  'up'),
  (:e3, :synt,  :iris,  'up'),
  (:e3, :yeole, :iris,  'up');

INSERT INTO event_photos (id, event_id, uploader_id, url, caption) VALUES
  (:p3, :e3, :iris,  'https://picsum.photos/seed/mello-dunes/900/1200',  'The dunes at blue hour'),
  (:p4, :e3, :sri,   'https://picsum.photos/seed/mello-fire/900/1200',   'Fire finally caught'),
  (:p5, :e3, :ameya, 'https://picsum.photos/seed/mello-tents/900/1200',  'Camp set up before dark');

-- All four tapbacks represented, and one person per photo per emoji.
INSERT INTO photo_reactions (photo_id, user_id, emoji) VALUES
  (:p3, :sri,   '❤️'), (:p3, :ameya, '❤️'), (:p3, :bliss, '😂'), (:p3, :synt, '👍'),
  (:p4, :iris,  '❤️'), (:p4, :ameya, '👍'), (:p4, :yeole, '❤️'),
  (:p5, :iris,  '😂'), (:p5, :sri,   '👍');

-- A real thread: two comments from the same person, which the old composite
-- primary key made impossible.
INSERT INTO wrap_photo_comments (photo_id, user_id, content) VALUES
  (:p3, :sri,   'this is unreal'),
  (:p3, :sri,   'sending me the full res one?'),
  (:p3, :iris,  'will do when I am back on wifi'),
  (:p4, :ameya, 'took us 40 minutes lol');

-- 3+ votes per category so every award has a decided winner (033 needs 3).
INSERT INTO superlative_votes (event_id, category, voter_id, votee_id) VALUES
  (:e3, 'mvp',             :iris,  :sri),
  (:e3, 'mvp',             :sri,   :iris),
  (:e3, 'mvp',             :ameya, :iris),
  (:e3, 'mvp',             :bliss, :iris),
  (:e3, 'first_to_arrive', :iris,  :ameya),
  (:e3, 'first_to_arrive', :sri,   :ameya),
  (:e3, 'first_to_arrive', :ameya, :ameya),
  (:e3, 'next_host',       :iris,  :bliss),
  (:e3, 'next_host',       :sri,   :bliss),
  (:e3, 'next_host',       :ameya, :bliss),
  (:e3, 'best_vibes',      :iris,  :synt),
  (:e3, 'best_vibes',      :sri,   :iris),
  (:e3, 'best_vibes',      :ameya, :iris),
  (:e3, 'best_vibes',      :bliss, :iris);

-- Notes land in the private half of the recap. One sealed, one already opened.
INSERT INTO wrap_notes (event_id, sender_id, recipient_id, content, opened_at) VALUES
  (:e3, :sri,   :iris, 'You made that whole night happen. Thank you.', NULL),
  (:e3, :ameya, :iris, 'Best plan of the year, easily.', NOW() - INTERVAL '4 hours');

INSERT INTO encore_requests (event_id, user_id) VALUES
  (:e3, :sri), (:e3, :ameya), (:e3, :bliss), (:e3, :synt);

-- Threshold is 3; exactly 3 contributed.
INSERT INTO wrap_contributions (event_id, user_id) VALUES
  (:e3, :iris), (:e3, :sri), (:e3, :ameya);

ALTER TABLE photo_reactions      ENABLE TRIGGER photo_reactions_notify;
ALTER TABLE wrap_photo_comments  ENABLE TRIGGER on_wrap_photo_comment;
ALTER TABLE wrap_contributions   ENABLE TRIGGER wrap_contributions_unlock;
