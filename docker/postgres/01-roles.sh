#!/bin/sh
# Runs once when the Postgres volume is created.
# - POSTGRES_USER (qualimix_owner) owns the schema and runs migrations.
# - qualimix_app is used by the API at runtime: data access only (no DDL, no DELETE).
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE qualimix_app LOGIN PASSWORD '${APP_DB_PASSWORD}';
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO qualimix_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO qualimix_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO qualimix_app;
SQL
