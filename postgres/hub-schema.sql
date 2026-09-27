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

-- Usuarios centralizados (Etapa 5): cuentas del dashboard de riego,
-- compartidas entre todos los sitios/Edges. Cada Edge valida el login en
-- tiempo real contra /api/users/login (ver hub_fn_login) -- no guarda
-- ninguna copia local de contrasenas. Si el Hub esta caido, el login deja
-- de funcionar en todos los sitios (aceptado: el riego en curso no se ve
-- afectado, solo el login/cambio de password/idioma).
CREATE TABLE IF NOT EXISTS riego_hub.users (
    id                    SERIAL PRIMARY KEY,
    username              VARCHAR(50) NOT NULL UNIQUE,
    password_hash         VARCHAR(255) NOT NULL,
    role                  TEXT NOT NULL DEFAULT 'estandar' CHECK (role IN ('admin','estandar')),
    must_change_password  BOOLEAN NOT NULL DEFAULT true,
    language              VARCHAR(2) NOT NULL DEFAULT 'es',
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now()
);

-- A que area(s) puede entrar cada usuario. Un usuario sin ninguna fila
-- aca no puede loguearse en ningun sitio (existe pero no tiene acceso).
CREATE TABLE IF NOT EXISTS riego_hub.user_areas (
    user_id  INTEGER NOT NULL REFERENCES riego_hub.users(id) ON DELETE CASCADE,
    area_id  TEXT NOT NULL REFERENCES riego_hub.areas(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, area_id)
);

-- Gateway publico (Etapa 6, water.riegocom.uk): direccion de red donde el
-- gateway puede alcanzar el Node-RED de cada area para reenviarle el
-- trafico (HTTP + WebSocket). Ej: 'http://nodered:1880' para un Edge en
-- este mismo docker-compose. NULL hasta que se cargue a mano en
-- /hub/areas -- un area sin esto no es alcanzable desde el gateway
-- (el login/estructura via heartbeat no se ven afectados, es independiente).
ALTER TABLE riego_hub.areas ADD COLUMN IF NOT EXISTS internal_url TEXT;
