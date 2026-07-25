-- ─────────────────────────────────────────────────────────────────────────────
-- REPORT TARGETS: reports was person-only (reported_id). Add nullable content
-- targets so a report can point at a specific comment (2c) or post (Phase 6),
-- while reported_id still carries the content's author. RLS is unchanged (insert
-- your own; reads are service-role). Run whole in the SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE reports ADD COLUMN IF NOT EXISTS comment_id UUID
  REFERENCES post_comments(id) ON DELETE CASCADE;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS post_id UUID
  REFERENCES posts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS reports_comment_idx ON reports (comment_id);
CREATE INDEX IF NOT EXISTS reports_post_idx    ON reports (post_id);
