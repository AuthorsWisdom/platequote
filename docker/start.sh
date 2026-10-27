#!/bin/sh
set -eu
# pg_isready can pass a moment before Prisma can connect. Retry the migration
# so a cold `docker compose up` does not exit the web container on the first try.
i=0
until npx prisma migrate deploy; do
  i=$((i + 1))
  if [ "$i" -ge 15 ]; then
    echo "Database did not accept migrations." >&2
    exit 1
  fi
  echo "Waiting for the database ($i)..." >&2
  sleep 2
done
node prisma/seed.mjs
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
