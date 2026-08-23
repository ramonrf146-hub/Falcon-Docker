#!/bin/bash
set -e

# ChirpStack v4 requires the pg_trgm extension for device search.
# The database and user are already created by the postgres image
# via POSTGRES_USER / POSTGRES_DB. This script just adds extensions.

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE EXTENSION IF NOT EXISTS hstore;
EOSQL
