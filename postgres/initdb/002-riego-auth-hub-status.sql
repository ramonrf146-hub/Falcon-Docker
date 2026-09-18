-- Cache local del ultimo heartbeat contra el Hub central (Etapa 2). Vive en
-- el schema "riego_auth" del Edge (mismo schema que la tabla de usuarios),
-- una sola fila que se actualiza en cada intento de heartbeat. El gate de
-- acceso remoto en nodered/settings.js lee esta fila -- ver el comentario
-- "Aprovisionamiento por area (Etapa 2)" ahi mismo.
--
-- Un error de red al contactar al Hub solo actualiza last_check_at, nunca
-- revoked ni last_ok_at -- perder internet nunca revoca un area por si solo.

CREATE SCHEMA IF NOT EXISTS riego_auth;

CREATE TABLE IF NOT EXISTS riego_auth.hub_status (
    id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    last_ok_at    TIMESTAMPTZ,
    last_check_at TIMESTAMPTZ,
    revoked       BOOLEAN NOT NULL DEFAULT false,
    -- Nombre que devuelve el Hub en cada heartbeat exitoso. Asi el Edge no
    -- necesita RIEGO_AREA_NAME propio: alcanza con RIEGO_AREA_ID+KEY para
    -- que el area "aparezca" con el nombre correcto (ver auth_fn_me).
    area_name     TEXT
);

INSERT INTO riego_auth.hub_status (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
