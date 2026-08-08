#!/usr/bin/env bash
# Run SQL against the remote Supabase database as `postgres`.
#
#   npm run sql -- supabase/migrations/074_wrap_contributions.sql
#   npm run sql -- -c "SELECT COUNT(*) FROM wrap_contributions"
#   npm run sql -- --single-transaction docs/probe.sql
#
# This exists because there is no Supabase CLI command that runs arbitrary SQL
# against a linked remote project — `db push` only applies migration files, and
# the verification blocks in docs/testing/*-sql.md are throwaway probes that
# insert rows, assert, then delete themselves. Those need a real psql session.
#
# `--single-transaction` is worth passing for any probe that mutates: the
# probes clean up after themselves at the end, so an error partway through
# otherwise leaves their rows behind in production.
#
# Homebrew's libpq is keg-only, so psql is not on PATH — hence the full path.
set -e
cd "$(dirname "$0")/.."

PSQL=$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)
if [ ! -x "$PSQL" ]; then
  echo "psql not found. Install it with:  brew install libpq" >&2
  exit 1
fi

# Read the key out of .env rather than sourcing the file — sourcing would
# execute whatever else is in there.
DB_URL=$(grep -E '^SUPABASE_DB_URL=' .env 2>/dev/null | head -1 | cut -d= -f2-)

if [ -z "$DB_URL" ]; then
  cat >&2 <<'EOF'
SUPABASE_DB_URL is not set in .env.

Get it from the Supabase dashboard:
  Project Settings -> Database -> Connection string -> URI  (session pooler)

Then add it to .env as:
  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres

Do NOT name it EXPO_PUBLIC_* — anything with that prefix is inlined into the
shipped app bundle, and this is a superuser credential.
EOF
  exit 1
fi

# ON_ERROR_STOP so a failing statement halts instead of scrolling past.
exec "$PSQL" "$DB_URL" -v ON_ERROR_STOP=1 "$@"
