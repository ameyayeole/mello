-- RLS is enabled in 002_tables.sql (same migration as table creation) so tables
-- are never exposed without it. This file defines the access policies only.

-- ─── PROFILES ───────────────────────────────────────────────────────────────
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- ─── EVENTS ──────────────────────────────────────────────────────────────────
CREATE POLICY "events_select_public" ON events
  FOR SELECT TO authenticated
  USING (is_public = TRUE OR host_id = auth.uid());

CREATE POLICY "events_insert" ON events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "events_update" ON events
  FOR UPDATE TO authenticated
  USING (auth.uid() = host_id);

CREATE POLICY "events_delete" ON events
  FOR DELETE TO authenticated
  USING (auth.uid() = host_id);

-- ─── EVENT PARTICIPANTS ───────────────────────────────────────────────────────
CREATE POLICY "participants_select" ON event_participants
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR event_id IN (SELECT id FROM events WHERE host_id = auth.uid())
  );

CREATE POLICY "participants_insert" ON event_participants
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "participants_delete" ON event_participants
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─── SAVED EVENTS ─────────────────────────────────────────────────────────────
CREATE POLICY "saved_events_all" ON saved_events
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── MESSAGES ────────────────────────────────────────────────────────────────
CREATE POLICY "messages_select" ON messages
  FOR SELECT TO authenticated
  USING (
    event_id IN (
      SELECT event_id FROM event_participants WHERE user_id = auth.uid()
      UNION
      SELECT id FROM events WHERE host_id = auth.uid()
    )
  );

CREATE POLICY "messages_insert" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND event_id IN (
      SELECT event_id FROM event_participants WHERE user_id = auth.uid()
      UNION
      SELECT id FROM events WHERE host_id = auth.uid()
    )
  );

-- ─── FRIENDSHIPS ──────────────────────────────────────────────────────────────
CREATE POLICY "friendships_select" ON friendships
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

CREATE POLICY "friendships_insert" ON friendships
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "friendships_update" ON friendships
  FOR UPDATE TO authenticated
  USING (addressee_id = auth.uid());

CREATE POLICY "friendships_delete" ON friendships
  FOR DELETE TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
CREATE POLICY "notifications_select" ON notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid());
