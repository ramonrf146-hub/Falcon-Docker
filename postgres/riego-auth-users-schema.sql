-- Usuarios del dashboard de riego (login multi-usuario / RBAC).
-- Vive en el schema "riego_auth" del Edge (mismo schema que "hub_status",
-- creado por postgres/initdb/002-riego-auth-hub-status.sql).
--
-- A diferencia de hub_status, esta tabla NUNCA tuvo un script propio -- en
-- guardian-docker se creo a mano en algun momento y nunca quedo
-- documentado en el repo. Este archivo cierra ese hueco.
--
-- Igual que postgres/hub-schema.sql, este script es MANUAL (no vive en
-- postgres/initdb/, que solo corre en el primer arranque de un volumen de
-- Postgres nuevo). Correrlo una vez por instalacion nueva con:
--   docker exec -i <contenedor_postgres> psql -U <user> -d <db> < postgres/riego-auth-users-schema.sql

CREATE SCHEMA IF NOT EXISTS riego_auth;

DO $$ BEGIN
    CREATE TYPE riego_auth.user_role AS ENUM ('admin', 'estandar');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS riego_auth.users (
    id                    SERIAL PRIMARY KEY,
    username              VARCHAR(50) NOT NULL UNIQUE,
    password_hash         VARCHAR(255) NOT NULL,
    role                  riego_auth.user_role NOT NULL DEFAULT 'estandar',
    must_change_password  BOOLEAN NOT NULL DEFAULT true,
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now(),
    language              VARCHAR(2) NOT NULL DEFAULT 'es'
);

CREATE INDEX IF NOT EXISTS idx_riego_auth_users_username ON riego_auth.users (username);
