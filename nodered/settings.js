// Falcon stack — Node-RED settings.js

const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

// Pool compartido hacia el Postgres del stack (mismo motor que usa
// ChirpStack, schema separado "riego_auth" para no pisar sus tablas).
const pgPool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB
});

// Sesiones de usuario del dashboard (login multi-usuario + RBAC), separadas
// del adminAuth del editor y del Basic-Auth compartido de /dashboard.
// La cookie de sesion es la que despues usan los flujos de login/cambio de
// password (via msg.req.session) y la logica de visibilidad por rol.
const sessionMiddleware = session({
    store: new pgSession({
        pool: pgPool,
        schemaName: 'riego_auth',
        tableName: 'session',
        createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        // Node-RED corre detras del Cloudflare Tunnel, que termina el HTTPS
        // en el borde de Cloudflare y le habla a este contenedor por HTTP
        // plano dentro de la red interna de Docker. Si esto fuera "true",
        // el navegador nunca guardaria la cookie (Node-RED nunca ve la
        // conexion como "segura"). La red interna no esta expuesta a
        // internet, solo el tunel, asi que es un tradeoff razonable.
        secure: false,
        sameSite: 'lax',
        maxAge: 8 * 60 * 60 * 1000 // 8 horas
    }
});

module.exports = {
    uiPort: process.env.PORT || 1880,
    uiHost: '0.0.0.0',

    flowFile: 'flows.json',
    flowFilePretty: true,

    credentialSecret: process.env.NODERED_CREDENTIAL_SECRET,

    // Protege el editor (/, la API admin, y por lo tanto la posibilidad de
    // reprogramar el sistema, editar el nodo Modbus, etc). Usuario/hash en
    // .env. El "tokens"/"tokenHeader" de abajo son el mecanismo que usa
    // Node-RED para auth por token estatico -- lo aprovechamos para el
    // bypass de acceso local (ver httpAdminMiddleware): si la peticion es
    // local, se inyecta ese header con el secreto interno ANTES de que
    // Node-RED procese la peticion, y esto la autentica como admin sin
    // pedir login. El secreto nunca sale del servidor.
    adminAuth: process.env.NODE_RED_ADMIN_PASSWORD_HASH ? {
        type: 'credentials',
        users: [{
            username: process.env.NODE_RED_ADMIN_USER || 'admin',
            password: process.env.NODE_RED_ADMIN_PASSWORD_HASH,
            permissions: '*'
        }],
        // El editor abre ademas un WebSocket propio (logs en vivo, estado del
        // deploy) con su propio mini-login que NO pasa por el bypass HTTP de
        // arriba (es una conexion de bajo nivel, antes de Express). Ese login
        // solo se guarda en el navegador por 7 dias por defecto -- lo estiro
        // a 10 anios para que, entrando una vez mas con tu usuario real, no
        // te lo vuelva a pedir en esa misma PC/navegador.
        sessionExpiryTime: 315360000,
        tokenHeader: 'x-local-bypass-token',
        tokens: (token) => {
            if (process.env.LOCAL_EDITOR_BYPASS_SECRET && token === process.env.LOCAL_EDITOR_BYPASS_SECRET) {
                return Promise.resolve({ username: 'local', permissions: '*' });
            }
            return Promise.resolve(null);
        }
    } : undefined,

    // Se aplica a TODAS las rutas del editor/API admin, antes de que
    // Node-RED evalue adminAuth. Si la peticion no trae "cf-connecting-ip"
    // (o sea, no vino por el Cloudflare Tunnel -- ver el mismo chequeo en
    // dashboard.middleware mas abajo, con la explicacion completa de por
    // que esto es seguro), se le agrega el header con el token de bypass
    // para que el editor entre directo, sin pedir usuario ni contrasena.
    httpAdminMiddleware: (request, response, next) => {
        if (!request.headers['cf-connecting-ip'] && process.env.LOCAL_EDITOR_BYPASS_SECRET) {
            request.headers['x-local-bypass-token'] = process.env.LOCAL_EDITOR_BYPASS_SECRET;
        }
        next();
    },

    // Protege /dashboard con sesiones multi-usuario (login individual + RBAC),
    // en vez del Basic-Auth compartido de un solo usuario que tenia antes.
    // La sesion tambien queda disponible para el socket.io de Dashboard 2.0
    // (misma cookie), y msg._client.session.user llega a los flujos.
    dashboard: {
        middleware: [
            sessionMiddleware,
            (request, response, next) => {
                // Bypass de login para acceso local (misma PC o LAN), SIN pasar
                // por el Cloudflare Tunnel. El header "cf-connecting-ip" lo
                // agrega unicamente el borde de Cloudflare -- si no esta
                // presente, la peticion no vino de internet/el tunel (no se
                // puede spoofear desde afuera mientras el puerto 1880 no este
                // reenviado en el router). Confirmado empiricamente: tanto el
                // acceso local como el trafico del tunel llegan desde IPs
                // internas de Docker (172.18.0.x), por eso NO se puede usar
                // solo la IP para distinguir -- hace falta este header.
                if (!request.headers['cf-connecting-ip']) {
                    if (!request.session.user) {
                        request.session.user = { id: 0, username: 'local', role: 'admin', mustChangePassword: false };
                    }
                    return next();
                }

                // Aprovisionamiento por area (Etapa 2): el dashboard remoto
                // (via Cloudflare) solo se habilita si el area esta bien
                // configurada. Si esta instancia ya tiene un Hub central
                // asignado (HUB_URL), se confia en el ultimo heartbeat
                // cacheado en riego_auth.hub_status (lo actualiza un flujo
                // periodico en auth_tab que le pega a
                // HUB_URL/api/areas/heartbeat); si todavia no hay Hub para
                // esta instancia, se cae al chequeo de solo-formato de la
                // Etapa 1 -- asi el cambio es 100% retrocompatible. El
                // acceso local de arriba nunca pasa por ninguno de los dos
                // caminos.
                const sendAreaBlocked = (titulo, detalle) => response.status(403).send(
                    '<!doctype html><html><head><meta charset="utf-8">' +
                    '<title>' + titulo + '</title></head>' +
                    '<body style="font-family:sans-serif; text-align:center; padding:60px 20px; color:#22303F;">' +
                    '<h2>🔒 ' + titulo + '</h2>' +
                    '<p>' + detalle + '</p>' +
                    '<p>El dashboard no se expone a internet hasta completar el aprovisionamiento.</p>' +
                    '</body></html>'
                );

                const proceedToSession = () => {
                    if (request.session && request.session.user) return next();
                    if (request.method === 'GET') return response.redirect('/riego-login');
                    return response.status(401).send('Autenticacion requerida');
                };

                const areaId = process.env.RIEGO_AREA_ID;
                const areaKey = process.env.RIEGO_AREA_KEY;
                const areaFormatOk = !!areaId && !!areaKey && areaKey !== 'CHANGE_ME' && areaKey.length >= 32;
                if (!areaFormatOk) {
                    return sendAreaBlocked('Area no aprovisionada', 'Esta instancia todavia no tiene un ID y clave de area validos configurados.');
                }

                if (!process.env.HUB_URL) {
                    return proceedToSession();
                }

                const graceHours = parseFloat(process.env.HUB_GRACE_PERIOD_HOURS) || 168;
                pgPool.query('SELECT last_ok_at, revoked FROM riego_auth.hub_status WHERE id = 1')
                    .then((result) => {
                        const row = result.rows[0];
                        if (!row) {
                            return sendAreaBlocked('Area no validada', 'Todavia no se pudo confirmar el estado de esta area con el Hub central.');
                        }
                        if (row.revoked) {
                            return sendAreaBlocked('Area revocada', 'El Hub central revoco el acceso remoto de esta area.');
                        }
                        const lastOkMs = row.last_ok_at ? new Date(row.last_ok_at).getTime() : 0;
                        const ageHours = (Date.now() - lastOkMs) / (1000 * 60 * 60);
                        if (!row.last_ok_at || ageHours > graceHours) {
                            return sendAreaBlocked('Area no validada', 'No se pudo validar esta area con el Hub central a tiempo (ultimo contacto exitoso hace mas de ' + graceHours + ' horas).');
                        }
                        return proceedToSession();
                    })
                    .catch((err) => {
                        console.error('[hub_status] error consultando riego_auth.hub_status:', err.message);
                        return sendAreaBlocked('Area no validada', 'No se pudo verificar el estado de esta area (error interno).');
                    });
            }
        ]
    },

    // Aplica la sesion a los endpoints HTTP definidos en el flujo (los nodos
    // http-in de /riego-auth/login, /cambiar-password, etc.), asi msg.req.session
    // queda disponible dentro del flujo.
    httpNodeMiddleware: sessionMiddleware,

    userDir: '/data/',
    nodesDir: '/data/nodes',

    // Sirve /data/static en la raiz (ej. /riego-icon-512.png), usado por el
    // appIcon del dashboard (manifest PWA / "Agregar a pantalla de inicio").
    httpStatic: '/data/static',

    diagnostics: { enabled: true, ui: true },
    runtimeState: { enabled: false, ui: false },

    logging: {
        console: {
            level: 'info',
            metrics: false,
            audit: false
        }
    },

    exportGlobalContextKeys: false,

    externalModules: {
        autoInstall: false,
        palette: { allowInstall: true, allowUpdate: true, allowUpload: true }
    },

    editorTheme: {
        projects: {
            enabled: false
        },
        codeEditor: { lib: 'monaco' }
    },

    functionExternalModules: true,
    functionGlobalContext: {
        // Pool de Postgres compartido para el flujo de login/usuarios (schema
        // riego_auth). Usar como: global.get('pgPool').query(...)
        pgPool: pgPool
    },

    debugMaxLength: 1000,
    mqttReconnectTime: 15000,
    serialReconnectTime: 15000
};
