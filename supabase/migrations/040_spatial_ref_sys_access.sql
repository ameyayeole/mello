-- ─────────────────────────────────────────────────────────────────────────────
-- spatial_ref_sys: take it off the public API.
-- Run this whole file in the Supabase SQL editor.
--
-- PROPORTION FIRST — this is tidying, not an incident.
--
-- `spatial_ref_sys` is PostGIS's copy of the EPSG registry: ~8500 rows of
-- coordinate-system definitions, byte-identical in every PostGIS installation
-- on earth. It holds no data of yours. A signed-out client reading it learns
-- that SRID 4326 is WGS 84, which they could also learn from Wikipedia.
--
-- It is worth fixing anyway, for two reasons. It is the one table in `public`
-- with RLS off, so it is permanent noise in every audit — and noise is where
-- real findings go to hide. And it costs nothing: PostgREST exposes it only
-- because the API roles hold SELECT on it, so removing that grant removes it
-- from the API without touching PostGIS.
--
-- WHY NOT `ENABLE ROW LEVEL SECURITY`
--
-- The obvious move fails: the table is owned by the postgis extension, and
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY needs ownership. On Supabase that
-- errors with "must be owner of table spatial_ref_sys". Revoking a grant only
-- needs the grantor's rights, which `postgres` has.
--
-- WHY THIS IS SAFE HERE — CHECKED, NOT ASSUMED
--
-- PostGIS reads this table for SRID lookups: ST_Transform, ST_SetSRID,
-- find_srid, ST_SRID. If a query running as `authenticated` needed one of
-- those, this revoke would break it.
--
-- Grepped the migrations: none of those appear. The geo surface is ST_MakePoint,
-- ST_Distance, ST_DWithin, ST_X and ST_Y, all on `geography`, which uses
-- spheroid constants compiled into the library rather than the lookup table.
-- Re-run that grep before adding ST_Transform to anything.
-- ─────────────────────────────────────────────────────────────────────────────

-- WHO ACTUALLY HOLDS THE GRANT
--
-- A first pass revoked from `anon` and `authenticated` and changed nothing,
-- because PostGIS's install script does `GRANT SELECT ON spatial_ref_sys TO
-- PUBLIC` — and `has_table_privilege` answers true if the role reaches the
-- privilege by *any* path, PUBLIC included. Revoking from a role that never
-- held the grant directly is a no-op.
--
-- This is the mirror image of the bug in migration 038, where a revoke FROM
-- PUBLIC did nothing because `anon` held the grant by name. Both mistakes come
-- from guessing the grantee instead of reading `relacl`. Read the ACL.
REVOKE SELECT ON public.spatial_ref_sys FROM PUBLIC;
REVOKE SELECT ON public.spatial_ref_sys FROM anon;
REVOKE SELECT ON public.spatial_ref_sys FROM authenticated;

-- ─── Verification + diagnosis (last statement — what the editor shows) ───────
--
-- If `anon_select` is still true, the REVOKE above was a no-op for the second
-- possible reason: you are not the table's owner. PostgreSQL does not error on
-- a revoke you lack the rights to make — it emits a WARNING and carries on, so
-- "ran successfully" means nothing here.
--
-- Read `owner` and `acl`:
--   owner = supabase_admin (not postgres) → you cannot revoke this from the SQL
--     editor. That is fine. It is the EPSG registry, it contains none of your
--     data, and the accepted resolutions are to leave it or to install PostGIS
--     into a schema PostgREST does not expose. Leave it, and remember why.
--   acl containing `=r/...` → PUBLIC still holds SELECT.
SELECT
  pg_get_userbyid(c.relowner)                                  AS owner,
  c.relacl                                                     AS acl,
  has_table_privilege('anon',          c.oid, 'SELECT')        AS anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT')        AS auth_select
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'spatial_ref_sys';
