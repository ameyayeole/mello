-- ─── ENUMS ──────────────────────────────────────────────────────────────────

CREATE TYPE activity_type AS ENUM (
  'coffee', 'gym', 'drinks', 'trekking',
  'study', 'music', 'parties', 'gaming'
);

CREATE TYPE friend_status AS ENUM ('pending', 'accepted', 'blocked');

CREATE TYPE notification_type AS ENUM (
  'friend_request', 'join_request', 'event_update',
  'new_message', 'event_starting_soon', 'friend_joined_event'
);

-- ─── PROFILES ───────────────────────────────────────────────────────────────
-- Extends auth.users (1-to-1, same UUID primary key)
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  photo_url       TEXT,
  age             INT CHECK (age >= 18 AND age <= 100),
  bio             TEXT,
  city            TEXT,
  interests       activity_type[] DEFAULT '{}',
  events_hosted   INT DEFAULT 0,
  friends_count   INT DEFAULT 0,
  is_ghost_mode   BOOLEAN DEFAULT FALSE,
  expo_push_token TEXT,
  last_seen       TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── EVENTS ──────────────────────────────────────────────────────────────────
CREATE TABLE events (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity       activity_type NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  location       GEOGRAPHY(POINT, 4326) NOT NULL,
  location_name  TEXT,
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ,
  max_people     INT CHECK (max_people >= 2),
  is_public      BOOLEAN DEFAULT TRUE,
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX events_location_idx  ON events USING GIST(location);
CREATE INDEX events_activity_idx  ON events (activity);
CREATE INDEX events_starts_at_idx ON events (starts_at);
CREATE INDEX events_host_id_idx   ON events (host_id);

-- ─── EVENT PARTICIPANTS ───────────────────────────────────────────────────────
CREATE TABLE event_participants (
  event_id  UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

-- ─── SAVED EVENTS ─────────────────────────────────────────────────────────────
CREATE TABLE saved_events (
  user_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id)
);

-- ─── MESSAGES ────────────────────────────────────────────────────────────────
CREATE TABLE messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES profiles(id),
  content    TEXT NOT NULL,
  type       TEXT DEFAULT 'text' CHECK (type IN ('text', 'system', 'location')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX messages_event_id_idx ON messages (event_id, created_at DESC);

-- ─── FRIENDSHIPS ──────────────────────────────────────────────────────────────
CREATE TABLE friendships (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status       friend_status DEFAULT 'pending',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE INDEX friendships_addressee_idx ON friendships (addressee_id, status);
CREATE INDEX friendships_requester_idx ON friendships (requester_id, status);

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_id    UUID REFERENCES profiles(id),
  type         notification_type NOT NULL,
  event_id     UUID REFERENCES events(id),
  is_read      BOOLEAN DEFAULT FALSE,
  payload      JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX notifications_recipient_idx ON notifications (recipient_id, is_read, created_at DESC);

-- ─── ENABLE ROW LEVEL SECURITY ───────────────────────────────────────────────
-- Enabled here (in the same migration as table creation) so there is never a
-- window where a table exists without RLS. A table with RLS enabled but no
-- policies denies all access by default (fail-closed). The actual policies are
-- defined in 003_rls.sql.
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
