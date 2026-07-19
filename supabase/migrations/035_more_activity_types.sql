-- ─────────────────────────────────────────────────────────────────────────────
-- 035: MORE ACTIVITY TYPES (expand the activity_type enum from 8 → 43)
-- The app's ActivityId union (src/types/models.ts) and ACTIVITIES list now
-- include a full set of nightlife, music, sports, wellness, food, outdoors,
-- creative and social types. The `events.activity` column and `profiles.interests`
-- array are both `activity_type`, so every new id MUST exist as an enum value or
-- inserts/updates from the app will fail with "invalid input value for enum".
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block, and the
-- new values are not usable in the same transaction that adds them. Run this
-- whole file in the Supabase SQL editor, AFTER 034. IF NOT EXISTS makes it
-- safe to re-run. No values are ever removed (Postgres can't drop enum values),
-- so this migration is additive-only and backwards compatible.
-- ─────────────────────────────────────────────────────────────────────────────

-- Nightlife & Parties
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'house_party';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'club_night';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'boiler_room';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'karaoke';

-- Music & Live
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'live_gig';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'open_mic';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'jam_session';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'standup';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'concert';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'dj_set';

-- Sports
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'cricket';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'football';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'badminton';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'volleyball';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'basketball';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'table_tennis';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'tennis';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'running';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'cycling';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'swimming';

-- Wellness
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'yoga';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'meditation';

-- Food & Drinks
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'food';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'brunch';

-- Outdoors & Travel
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'camping';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'beach';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'road_trip';

-- Creative & Culture
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'art';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'photography';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'dance';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'movies';

-- Social & Growth
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'volunteering';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'networking';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'book_club';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'board_games';
