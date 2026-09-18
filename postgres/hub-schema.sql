-- Esquema del Hub central de areas (Etapa 2). A diferencia de
-- postgres/initdb/*, este script NO se aplica automaticamente: solo hace
-- falta correrlo una vez contra el Postgres que efectivamente sirve al
-- servicio "hub-nodered" (hoy, el mismo Postgres compartido del stack).
--
-- Aplicar con:
--   docker exec -i <contenedor_postgres> psql -U <POSTGRES_USER> -d <POSTGRES_DB> < postgres/hub-schema.sql

CREATE SCHEMA IF NOT EXISTS riego_hub;

CREATE TABLE IF NOT EXISTS riego_hub.areas (
    id                TEXT PRIMARY KEY,   -- mismo string que RIEGO_AREA_ID del Edge (ej. 'casa-principal')
    name              TEXT NOT NULL,
    key_hash          TEXT NOT NULL,      -- sha256(RIEGO_AREA_KEY) en hex, nunca se guarda en texto plano
    status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_heartbeat_at TIMESTAMPTZ,
    last_heartbeat_ip TEXT,
    -- Estructura (Etapa 3): zonas/valvulas/sensores/ajustes de esta area,
    -- gestionados desde /hub/areas/:id/estructura. Cada Edge la sincroniza
    -- via heartbeat (structure_version) y la cachea localmente -- ver
    -- riego_auth.hub_status.structure_version en el Edge.
    structure_version INTEGER NOT NULL DEFAULT 0,
    structure         JSONB NOT NULL DEFAULT
        '{"zonas":[],"valvulas":[],"sensores":[],"config":{"watchdogMinutos":60}}'::jsonb
);
