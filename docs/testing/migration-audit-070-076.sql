-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION AUDIT 070–076. Does the schema actually contain what each migration
-- was supposed to create? Run whole-file in the Supabase SQL editor.
--
-- NOTE: there is no 071 in the repo — the files go 070, 072, 073, 074, 075, 076.
--
-- This checks EXISTENCE, not correctness. A ✅ on 075 means get_wrap_gate is
-- there; it does not mean the threshold arithmetic is right. That is what the
-- B2 query in wrap-social-gate-phase-1-sql.md is for, and it is still the one
-- that matters most.
-- ─────────────────────────────────────────────────────────────────────────────

WITH checks AS (
  -- ── 070: link an event to a post ──────────────────────────────────────────
  SELECT '070' AS migration, 'posts.ref_event_id column' AS object,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'posts'
                    AND column_name = 'ref_event_id') AS present
  UNION ALL
  SELECT '070', 'community_feed_page() returns ref_event_id',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'community_feed_page'
                   AND pg_get_functiondef(oid) LIKE '%ref_event_id%')
  UNION ALL
  SELECT '070', 'user_posts() returns ref_event_id',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'user_posts'
                   AND pg_get_functiondef(oid) LIKE '%ref_event_id%')
  UNION ALL
  SELECT '070', 'get_post() returns ref_event_id',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_post'
                   AND pg_get_functiondef(oid) LIKE '%ref_event_id%')
  UNION ALL
  SELECT '070', 'posts_insert policy guards ref_event_id',
         EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename = 'posts' AND policyname = 'posts_insert'
                    AND qual || with_check LIKE '%ref_event_id%')

  -- ── 072: message replies ──────────────────────────────────────────────────
  UNION ALL
  SELECT '072', 'messages reply columns (need 3)',
         (SELECT COUNT(*) FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'messages'
             AND column_name IN
                 ('reply_to_id', 'reply_preview', 'reply_sender_name')) = 3
  UNION ALL
  SELECT '072', 'direct_messages reply columns (need 3)',
         (SELECT COUNT(*) FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'direct_messages'
             AND column_name IN
                 ('reply_to_id', 'reply_preview', 'reply_sender_name')) = 3
  UNION ALL
  SELECT '072', 'both partial reply indexes',
         (SELECT COUNT(*) FROM pg_indexes
           WHERE schemaname = 'public' AND indexname IN
                 ('messages_reply_to_id_idx',
                  'direct_messages_reply_to_id_idx')) = 2

  -- ── 073: chat polls ───────────────────────────────────────────────────────
  UNION ALL
  SELECT '073', 'poll tables (need 3)',
         (SELECT COUNT(*) FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name IN
                 ('message_polls', 'message_poll_options',
                  'message_poll_votes')) = 3
  UNION ALL
  SELECT '073', 'can_see_message() helper',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_see_message')
  UNION ALL
  SELECT '073', 'on_message_poll_vote trigger',
         EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'on_message_poll_vote' AND NOT tgisinternal)
  UNION ALL
  SELECT '073', 'poll RLS policies (need 6)',
         (SELECT COUNT(*) FROM pg_policies
           WHERE tablename IN ('message_polls', 'message_poll_options',
                               'message_poll_votes')) >= 6

  -- ── 074: the wrap_contributions marker table ──────────────────────────────
  UNION ALL
  SELECT '074', 'wrap_contributions table',
         EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public'
                    AND table_name = 'wrap_contributions')
  UNION ALL
  SELECT '074', 'RLS enabled on wrap_contributions',
         COALESCE((SELECT relrowsecurity FROM pg_class
                    WHERE relname = 'wrap_contributions'), FALSE)
  UNION ALL
  SELECT '074', 'both wrap_contributions policies',
         (SELECT COUNT(*) FROM pg_policies
           WHERE tablename = 'wrap_contributions'
             AND policyname IN ('wrap_contributions_select',
                                'wrap_contributions_insert')) = 2
  UNION ALL
  SELECT '074', 'wrap_contributions_event_idx',
         EXISTS (SELECT 1 FROM pg_indexes
                  WHERE indexname = 'wrap_contributions_event_idx')

  -- ── 075: the gate RPC ─────────────────────────────────────────────────────
  UNION ALL
  SELECT '075', 'get_wrap_gate() exists',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_wrap_gate')
  UNION ALL
  SELECT '075', 'get_wrap_gate is SECURITY DEFINER',
         COALESCE((SELECT prosecdef FROM pg_proc
                    WHERE proname = 'get_wrap_gate' LIMIT 1), FALSE)
  UNION ALL
  SELECT '075', 'get_wrap_gate re-asserts attendance',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_wrap_gate'
                   AND pg_get_functiondef(oid) LIKE '%is_event_attendee%')
  UNION ALL
  SELECT '075', 'EXECUTE granted to authenticated',
         EXISTS (SELECT 1 FROM information_schema.routine_privileges
                  WHERE routine_name = 'get_wrap_gate'
                    AND grantee = 'authenticated'
                    AND privilege_type = 'EXECUTE')

  -- ── 076: the unlock notification ──────────────────────────────────────────
  UNION ALL
  SELECT '076', 'notification_type has wrap_unlocked',
         EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                  WHERE t.typname = 'notification_type'
                    AND e.enumlabel = 'wrap_unlocked')
  UNION ALL
  SELECT '076', 'events.wrap_unlocked_notified column',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'events'
                    AND column_name = 'wrap_unlocked_notified')
  UNION ALL
  SELECT '076', 'notify_wrap_unlocked() exists',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_wrap_unlocked')
  UNION ALL
  SELECT '076', 'trigger wrap_contributions_unlock wired',
         EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'wrap_contributions_unlock'
                    AND NOT tgisinternal)
  UNION ALL
  -- The atomic-claim deviation. If this is ❌ you ran an older draft of 076 and
  -- two simultaneous contributions can double-notify.
  SELECT '076', 'flag claimed atomically (UPDATE ... WHERE = FALSE)',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_wrap_unlocked'
                   AND pg_get_functiondef(oid) LIKE '%wrap_unlocked_notified = FALSE%')
  UNION ALL
  -- Guards against the plan's wrong column names having been pasted.
  SELECT '076', 'inserts recipient_id, not user_id',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_wrap_unlocked'
                   AND pg_get_functiondef(oid) LIKE '%recipient_id%')
)
SELECT migration,
       object,
       CASE WHEN present THEN 'ok' ELSE 'MISSING' END AS status
  FROM checks
 ORDER BY migration, object;
