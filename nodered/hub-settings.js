// Riego stack — Hub settings.js
// Instancia de Node-RED SEPARADA del Edge (ver docker-compose.yml,
// servicio "hub-nodered"). Gestiona el ciclo de vida de las areas (crear,
// revocar, rotar keys) y expone el endpoint de heartbeat que cada Edge
// consulta periodicamente. No controla ninguna valvula ni sensor -- si
// esta instancia se cae, el riego de cada Edge sigue funcionando con
// normalidad (ver HUB_GRACE_PERIOD_HOURS en el settings.js del Edge).

const crypto = require('crypto');
const { Pool } = require('pg');

// Mismo Postgres que usa el Edge/ChirpStack, schema propio "riego_hub"
// para no pisar ninguna tabla existente.
const pgPool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB
});

// Verifica un hash generado con scrypt (formato "saltHex:hashHex", ver
// nodered/scripts/hash-hub-password.js). No se usa bcrypt aca a proposito,
// para no depender de instalar un modulo npm extra en esta instancia --
// crypto.scrypt viene incluido en Node.
function verifyHubPassword(password, stored) {
    if (!stored || !password) return false;
    const parts = stored.split(':');
    if (parts.length !== 2) return false;
    const [saltHex, hashHex] = parts;
    try {
        const derived = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
        const expected = Buffer.from(hashHex, 'hex');
        return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
    } catch (err) {
        return false;
    }
}

// Basic Auth (prompt nativo del navegador) para TODO el sitio de
// administracion del Hub (paginas /hub/*). El endpoint
// /api/areas/heartbeat NO pasa por aca -- el Edge se autentica con su
// area_id/area_key en el body del POST, no con usuario/clave.
function requireHubAdmin(request, response, next) {
    if (!request.path.startsWith('/hub')) return next();

    const header = request.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
        const decoded = Buffer.from(encoded, 'base64').toString('utf8');
        const sep = decoded.indexOf(':');
        const user = sep === -1 ? decoded : decoded.slice(0, sep);
        const pass = sep === -1 ? '' : decoded.slice(sep + 1);
        if (user === (process.env.HUB_ADMIN_USER || 'admin') && verifyHubPassword(pass, process.env.HUB_ADMIN_PASSWORD_HASH)) {
            return next();
        }
    }
    response.set('WWW-Authenticate', 'Basic realm="Riego Hub"');
    return response.status(401).send('Autenticacion requerida');
}

module.exports = {
    uiPort: process.env.PORT || 1880,
    uiHost: '0.0.0.0',

    flowFile: 'flows.json',
    flowFilePretty: true,

    credentialSecret: process.env.NODERED_CREDENTIAL_SECRET,

    // Protege el editor de ESTE Node-RED (el del Hub, puerto 1881). Node-RED
    // hace su propio chequeo de bcrypt internamente para este hash -- no
    // hace falta ningun modulo extra aca (distinto del hash de
    // HUB_ADMIN_PASSWORD_HASH de abajo, que es scrypt y protege las
    // paginas /hub/*, no el editor).
    adminAuth: process.env.HUB_EDITOR_PASSWORD_HASH ? {
        type: 'credentials',
        users: [{
            username: process.env.HUB_ADMIN_USER || 'admin',
            password: process.env.HUB_EDITOR_PASSWORD_HASH,
            permissions: '*'
        }]
    } : undefined,

    // Protege las paginas propias del Hub (/hub/...) con Basic Auth.
    httpNodeMiddleware: requireHubAdmin,

    userDir: '/data/',
    nodesDir: '/data/nodes',

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
        codeEditor: { lib: 'monaco' }
    },

    functionExternalModules: true,
    functionGlobalContext: {
        // Pool de Postgres compartido para los flujos de areas (schema
        // riego_hub). Usar como: global.get('pgPool').query(...)
        pgPool: pgPool
    },

    debugMaxLength: 1000
};
