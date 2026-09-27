// Water Gateway -- punto de entrada publico unico (water.riegocom.uk).
//
// Flujo: loguea contra el Hub central (riego_hub.users, sin area_id/key
// porque todavia no sabemos en cual va a operar), guarda que areas tiene
// asignadas, y reenvia TODO el trafico (HTTP + WebSocket de Node-RED
// Dashboard 2.0) al Node-RED real de la area seleccionada. Si el usuario
// tiene varias areas, un selector flotante inyectado en el HTML proxyado
// deja moverse entre ellas sin volver a loguearse.
//
// Ademas del proxy "transparente", el gateway hace un login real contra
// CADA area asignada (server-to-server, en el momento del login) para
// tener la cookie de sesion propia de ese Edge y adjuntarla en cada
// request proxyado -- asi el dashboard muestra el usuario/rol correctos
// y "cambiar mi contrasena" funciona igual que entrando directo.

const http = require('http');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const pgSessionStore = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const cookie = require('cookie');
const cookieSignature = require('cookie-signature');
const { probeArea, shell } = require('./dashboard-shell');

const PORT = process.env.PORT || 3000;
const HUB_URL = (process.env.HUB_URL || 'http://hub-nodered:1880').replace(/\/$/, '');
const GATEWAY_SHARED_SECRET = process.env.GATEWAY_SHARED_SECRET || '';
const SESSION_SECRET = process.env.GATEWAY_SESSION_SECRET || '';
const COOKIE_NAME = 'water_gateway_sid';

if (!GATEWAY_SHARED_SECRET) console.warn('[water-gateway] ADVERTENCIA: GATEWAY_SHARED_SECRET vacio -- el login va a fallar.');
if (!SESSION_SECRET) console.warn('[water-gateway] ADVERTENCIA: GATEWAY_SESSION_SECRET vacio -- usando un valor inseguro temporal.');

const pgPool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB
    ,port: Number(process.env.POSTGRES_PORT || 5432)
});

const sessionStore = new pgSessionStore({
    pool: pgPool,
    schemaName: 'riego_hub',
    tableName: 'gateway_sessions',
    createTableIfMissing: true
});

const sessionMiddleware = session({
    store: sessionStore,
    name: COOKIE_NAME,
    secret: SESSION_SECRET || 'inseguro-cambiar-GATEWAY_SESSION_SECRET',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' }
});

const app = express();
app.use(sessionMiddleware);
// Consultar tambien sesiones anteriores al despliegue y cambios hechos en el Hub.
app.use(async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.session.user) return next();
    try {
        const { rows } = await pgPool.query('SELECT must_change_password, role FROM riego_hub.users WHERE id=$1', [req.session.user.id]);
        if (!rows.length) return req.session.destroy(() => res.redirect('/login'));
        req.session.user.mustChangePassword = rows[0].must_change_password;
        req.session.user.role = rows[0].role;
        next();
    } catch (err) {
        res.status(503).send('No se pudo consultar el Hub. Intenta nuevamente.');
    }
});
// OJO: express.urlencoded()/json() se aplican SOLO en las rutas propias
// del gateway (login, select-area) -- si se aplicaran globalmente
// consumirian el stream del request antes de llegar al proxy, y el
// reenvio al Edge llegaria con el body vacio.
const parseForm = express.urlencoded({ extended: false });

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page(title, body) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F7FAFA;color:#22303F;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{box-sizing:border-box;background:#fff;border-radius:16px;padding:32px;width:100%;max-width:340px;box-shadow:0 8px 30px rgba(15,40,45,0.12)}
h1{font-size:20px;margin:0 0 20px;color:#0E7C86}
label{display:block;font-size:11px;font-weight:700;color:#5C6B78;text-transform:uppercase;margin:14px 0 6px}
input{width:100%;box-sizing:border-box;padding:10px;border:1.5px solid #E4ECED;border-radius:8px;font-size:16px}
button{margin-top:20px;width:100%;padding:11px;background:#0E7C86;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:15px;cursor:pointer}
.err{background:#FDECEA;color:#C0392B;padding:10px 12px;border-radius:8px;font-size:13px;margin-top:14px}
</style></head><body><div class="card">${body}</div></body></html>`;
}

// ---------------------------------------------------------------
// Login
// ---------------------------------------------------------------

app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect(req.session.user.mustChangePassword ? '/gateway/change-password' : '/');
    res.send(page('Riego -- Ingresar', loginFormWithError('')));
});

// Login server-to-server contra el Edge real de un area, para tener una
// cookie de sesion valida ahi (asi el dashboard proxyado muestra el
// usuario/rol reales, y "cambiar mi contrasena" funciona a traves del
// gateway). Si el Edge no esta alcanzable no bloquea el login general --
// esa area queda marcada como no disponible en el selector.
async function intentoLoginEdge(internalUrl, username, password) {
    const r = await fetch(internalUrl.replace(/\/$/, '') + '/riego-auth/login', {
        method: 'POST',
        signal: AbortSignal.timeout(4000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const setCookie = r.headers.get('set-cookie');
    if (!setCookie) throw new Error('sin set-cookie en la respuesta');
    return setCookie.split(';')[0]; // solo "nombre=valor", sin atributos
}

// Reintenta una vez tras una pausa corta -- un Edge recien reiniciado
// (deploy, restart manual) puede tardar un par de segundos en aceptar
// conexiones; sin este reintento, un login que coincide con ese momento
// deja al usuario sin cookie de sesion real en ese Edge por el resto de
// su sesion del gateway (hasta que vuelva a loguearse a mano).
async function establecerSesionEdge(internalUrl, username, password) {
    if (!internalUrl) return null;
    for (let intento = 1; intento <= 2; intento++) {
        try {
            return await intentoLoginEdge(internalUrl, username, password);
        } catch (err) {
            console.warn(`[water-gateway] intento ${intento}/2 de sesion en ${internalUrl} fallo: ${err.message}`);
            if (intento === 1) await new Promise((resolve) => setTimeout(resolve, 1500));
        }
    }
    return null;
}

app.post('/login', parseForm, async (req, res, next) => {
    try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password) {
        return res.send(page('Riego -- Ingresar', loginFormWithError('Falta usuario o contrasena')));
    }
    let hubResp;
    try {
        hubResp = await fetch(HUB_URL + '/api/users/login-direct', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-gateway-secret': GATEWAY_SHARED_SECRET },
            body: JSON.stringify({ username, password })
        });
    } catch (err) {
        return res.send(page('Riego -- Ingresar', loginFormWithError('No se pudo conectar con el Hub central')));
    }
    const data = await hubResp.json().catch(() => ({}));
    if (!hubResp.ok || !data.ok) {
        return res.send(page('Riego -- Ingresar', loginFormWithError(data.error || 'Usuario o contrasena incorrectos')));
    }
    const areas = Array.isArray(data.areas) ? data.areas : [];
    if (!areas.length) {
        return res.send(page('Riego -- Ingresar', loginFormWithError('Tu usuario no tiene ninguna area asignada. Pedile a un administrador que te asigne una en el Hub.')));
    }

    await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.user = { id: data.user.id, username: data.user.username, role: data.user.role, mustChangePassword: data.user.mustChangePassword === true };
    if (req.session.user.mustChangePassword) {
        // No crear sesiones operativas en los Edges con una clave inicial.
        return req.session.save(err => err ? next(err) : res.redirect('/gateway/change-password'));
    }

    // Traer internal_url de cada area asignada y establecer sesion real en cada Edge alcanzable.
    const { rows } = await pgPool.query(
        `SELECT id, name, internal_url FROM riego_hub.areas WHERE id = ANY($1::text[]) ORDER BY name`,
        [areas.map(a => a.id)]
    );
    const edgeCookies = {};
    const areasConEstado = [];
    await Promise.all(rows.map(async a => {
        const cookieVal = await establecerSesionEdge(a.internal_url, username, password);
        if (a.internal_url && cookieVal) edgeCookies[a.id] = cookieVal;
        areasConEstado.push({ id: a.id, name: a.name, disponible: !!(a.internal_url && cookieVal) });
    }));
    areasConEstado.sort((a,b)=>a.name.localeCompare(b.name));

    req.session.areas = areasConEstado;
    req.session.edgeCookies = edgeCookies;
    const primeraDisponible = areasConEstado.find(a => a.disponible) || areasConEstado[0];
    req.session.selectedArea = primeraDisponible.id;

    req.session.save(err => err ? next(err) : res.redirect('/'));
    } catch (err) { next(err); }
});

function loginFormWithError(msg) {
    return `
        <h1>Riego</h1>
        <form method="POST" action="/login">
            <label for="username">Usuario</label><input id="username" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus>
            <label for="password">Contrasena</label><input id="password" name="password" type="password" autocomplete="current-password" required>
            <button type="submit">Entrar</button>
        </form>
        ${msg ? `<div class="err" role="alert">${esc(msg)}</div>` : ''}
    `;
}

app.get('/gateway/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

function changePasswordPage(req, error = '') {
    req.session.passwordCsrf ||= crypto.randomBytes(32).toString('hex');
    return page('Cambiar contrasena inicial', `
        <h1>Cambia tu contrasena inicial</h1>
        <p>Antes de entrar al panel, elige una contrasena nueva de al menos 8 caracteres.</p>
        <form method="POST" action="/gateway/change-password">
            <input type="hidden" name="csrf" value="${esc(req.session.passwordCsrf)}">
            <input type="hidden" name="username" autocomplete="username" value="${esc(req.session.user.username)}">
            <label for="currentPassword">Contrasena actual</label><input id="currentPassword" name="currentPassword" type="password" autocomplete="current-password" required>
            <label for="newPassword">Nueva contrasena</label><input id="newPassword" name="newPassword" type="password" autocomplete="new-password" minlength="8" required>
            <label for="confirmPassword">Repite la nueva contrasena</label><input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required>
            <button type="submit">Guardar contrasena</button>
        </form>
        ${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}
        <p><a href="/gateway/logout">Salir</a></p>`);
}

app.get('/gateway/change-password', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.send(changePasswordPage(req));
});

app.post('/gateway/change-password', parseForm, async (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    const { currentPassword, newPassword, confirmPassword, csrf } = req.body || {};
    if (!csrf || csrf !== req.session.passwordCsrf) return res.status(403).send(changePasswordPage(req, 'Formulario vencido. Intenta nuevamente.'));
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword !== confirmPassword || newPassword === currentPassword) {
        return res.status(400).send(changePasswordPage(req, 'Usa una contrasena diferente de al menos 8 caracteres y repitela igual.'));
    }
    try {
        const response = await fetch(HUB_URL + '/api/users/change-password-direct', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-gateway-secret': GATEWAY_SHARED_SECRET },
            body: JSON.stringify({ user_id: req.session.user.id, currentPassword, newPassword }),
            signal: AbortSignal.timeout(10000)
        });
        const data = await response.json();
        if (!response.ok || !data.ok) return res.status(response.status >= 500 ? 503 : 400).send(changePasswordPage(req, data.error || 'No se pudo cambiar la contrasena.'));
        // Descartar cookies de Edge anteriores. El nuevo login las crea con la nueva clave.
        req.session.destroy(err => err ? next(err) : res.send(page('Contrasena actualizada', '<h1>Contrasena actualizada</h1><p>Ingresa con tu nueva contrasena para continuar.</p><a href="/login">Ingresar</a>')));
    } catch (err) {
        res.status(503).send(changePasswordPage(req, 'No se pudo confirmar el cambio. Intenta ingresar con la nueva contrasena o vuelve a intentar.'));
    }
});

app.post('/gateway/select-area', parseForm, (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.mustChangePassword) return res.redirect('/gateway/change-password');
    const areaId = (req.body || {}).area;
    const match = (req.session.areas || []).find(a => a.id === areaId);
    if (match) {
        req.session.selectedArea = areaId;
    }
    req.session.save(err => err ? res.status(503).send('No se pudo seleccionar el area') : res.redirect('/dashboard/'));
});

// ---------------------------------------------------------------
// Gate: todo lo que sigue requiere sesion
// ---------------------------------------------------------------

app.use((req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.mustChangePassword) return res.redirect('/gateway/change-password');
    if (!req.session.selectedArea && !req.path.startsWith('/hub')) {
        return res.status(403).send(page('Sin area', '<h1>Sin area disponible</h1><p style="font-size:13px;">Tu usuario no tiene ninguna area alcanzable desde el gateway todavia.</p>'));
    }
    // La raiz "/" del Node-RED de cada Edge es el EDITOR de flujos, no el
    // dashboard -- un usuario final tiene que caer siempre en el dashboard.
    if (req.path === '/') return res.redirect('/dashboard/');
    next();
});

// The outer dashboard belongs to the gateway, never to an Edge.
app.get(['/dashboard', '/dashboard/'], (req,res)=>res.send(shell(req.session.areas||[],req.session.selectedArea,req.query.view,req.session.user.role==='admin')));
// Administration is served by the central Hub, never by a local Edge.
app.use('/hub', (req,res,next)=>{
    if(req.session.user.role!=='admin')return res.status(403).send('Solo administradores');
    next();
},createProxyMiddleware({target:HUB_URL,changeOrigin:true,proxyTimeout:10000,
    onProxyReq:(proxyReq,req)=>{
        const stamp=String(Date.now());
        const actor=String(req.session.user.id);
        const signature=crypto.createHmac('sha256',GATEWAY_SHARED_SECRET).update(actor+':'+stamp).digest('hex');
        proxyReq.removeHeader('authorization');
        proxyReq.setHeader('x-hub-actor',actor);proxyReq.setHeader('x-hub-time',stamp);proxyReq.setHeader('x-hub-signature',signature);
    },
    onError:(err,req,res)=>res.status(503).send('Hub temporalmente no disponible')
}));
app.get('/riego-login', (req,res)=>res.redirect('/gateway/reconnect'));
app.get('/gateway/reconnect', (req,res)=>{
    res.send(page('Reconectar area','<h1>Reconectar área</h1><p>Confirma tu contraseña para renovar la sesión de esta área.</p><form method="POST" action="/gateway/reconnect" target="_top"><label>Contraseña</label><input name="password" type="password" autocomplete="current-password" required><button>Reconectar</button></form><p><a target="_top" href="/dashboard/">Volver al panel</a></p>'));
});
app.post('/gateway/reconnect', parseForm, async (req,res)=>{
    try {
        const id=req.session.selectedArea;
        if(!(req.session.areas||[]).some(a=>a.id===id))return res.sendStatus(403);
        const {rows}=await pgPool.query('SELECT internal_url FROM riego_hub.areas WHERE id = $1',[id]);
        const password=typeof req.body?.password==='string'?req.body.password:'';
        const value=password && await establecerSesionEdge(rows[0]?.internal_url,req.session.user.username,password);
        if(!value)return res.status(503).send(page('No se pudo reconectar','<h1>No se pudo reconectar</h1><p>Comprueba la contraseña y la conexión del área.</p><a href="/gateway/reconnect">Reintentar</a> · <a href="/dashboard/">Volver al panel</a>'));
        req.session.edgeCookies||={};req.session.edgeCookies[id]=value;
        req.session.save(err=>err?res.sendStatus(503):res.redirect('/dashboard/'));
    } catch {res.sendStatus(503);}
});
app.get('/gateway/areas-status', async (req,res)=>{
    try {
        const ids=(req.session.areas||[]).map(a=>a.id);
        const {rows}=await pgPool.query('SELECT id, name, internal_url FROM riego_hub.areas WHERE id = ANY($1::text[]) ORDER BY name',[ids]);
        res.json({areas:await Promise.all(rows.map(a=>probeArea(a)))});
    } catch { res.status(503).json({error:'No se pudo consultar el estado de las areas'}); }
});

// ---------------------------------------------------------------
// Barra flotante de seleccion de area (solo si hay mas de una)
// ---------------------------------------------------------------

function barraSelectorHtml(areas, selectedArea) {
    // Solo mostrar areas realmente utilizables -- una asignada pero sin
    // internal_url (o inalcanzable) no le sirve de nada al usuario en el
    // selector, solo confunde (ej. un area que todavia no se levanto en
    // ninguna PC). Se filtra aca, no en el login, para no perder el dato
    // de "esta asignado pero no disponible" en el resto de la sesion.
    const disponibles = areas;
    if (disponibles.length < 2) return '';
    const opciones = disponibles.map(a =>
        `<option value="${esc(a.id)}" ${a.id === selectedArea ? 'selected' : ''}>${esc(a.name)}</option>`
    ).join('');
    return `
<div id="rz-gateway-bar" style="position:fixed;bottom:calc(16px + env(safe-area-inset-bottom, 0px));right:calc(16px + env(safe-area-inset-right, 0px));z-index:999999;background:#0E7C86;color:#fff;
border-radius:999px;padding:10px 14px;box-shadow:0 4px 18px rgba(15,40,45,0.35);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
font-size:13px;display:flex;align-items:center;gap:8px;">
  <span style="font-weight:700;">Area:</span>
  <form method="POST" action="/gateway/select-area" target="_top" style="margin:0;">
    <select name="area" onchange="this.form.submit()" style="border-radius:999px;border:none;padding:8px 10px;font-size:13px;min-height:34px;">${opciones}</select>
  </form>
  <a href="/gateway/logout" style="color:#fff;text-decoration:underline;font-size:12px;padding:6px 0;">Salir</a>
</div>`;
}

// ---------------------------------------------------------------
// Proxy dinamico hacia el Edge de la area seleccionada
// ---------------------------------------------------------------
//
// OJO -- hallazgo importante: http-proxy-middleware, con ws:true, se
// autoregistra en el evento 'upgrade' del servidor HTTP subyacente en
// cuanto se monta con app.use() (no hace falta -- de hecho, ROMPE si
// tambien se registra un listener manual: quedan dos compitiendo por el
// mismo socket, y el automatico usa el req crudo, sin sesion, y explota
// con "Cannot read properties of undefined (reading 'areas')").
//
// Por eso el "router" de aca abajo NUNCA asume que req.session ya existe
// (cierto en un request HTTP normal, donde express-session ya corrio,
// pero FALSO en un upgrade de WebSocket, que nunca pasa por Express). En
// vez de eso resuelve la sesion el mismo, a mano, leyendo la cookie
// firmada -- funciona igual para ambos casos.
async function resolverSesionYTarget(req) {
    let sessionData = req.session && req.session.user ? req.session : null;
    if (!sessionData) {
        const cookies = cookie.parse(req.headers.cookie || '');
        const raw = cookies[COOKIE_NAME];
        if (!raw || !raw.startsWith('s:')) return null;
        const sid = cookieSignature.unsign(raw.slice(2), SESSION_SECRET || 'inseguro-cambiar-GATEWAY_SESSION_SECRET');
        if (!sid) return null;
        sessionData = await new Promise((resolve) => sessionStore.get(sid, (err, data) => resolve(err ? null : data)));
        if (!sessionData || !sessionData.user) return null;
    }
    // El upgrade WebSocket no atraviesa los middlewares HTTP.
    const { rows: users } = await pgPool.query('SELECT must_change_password FROM riego_hub.users WHERE id=$1', [sessionData.user.id]);
    if (!users.length || users[0].must_change_password || sessionData.user.mustChangePassword) return null;
    if (!sessionData.selectedArea) return null;
    const area = (sessionData.areas || []).find(a => a.id === sessionData.selectedArea);
    if (!area) return null;
    const { rows } = await pgPool.query('SELECT internal_url FROM riego_hub.areas WHERE id = $1', [sessionData.selectedArea]);
    const target = rows[0] && rows[0].internal_url;
    if (!target) return null;
    return { sessionData, target };
}

const proxy = createProxyMiddleware({
    changeOrigin: true,
    ws: true,
    selfHandleResponse: true,
    // Socket.IO long polling may wait 25 seconds before its heartbeat.
    proxyTimeout: 35000,
    onProxyReqWs: (proxyReq, req) => {
        const resolved=req._rzResuelto;
        const value=resolved && (resolved.sessionData.edgeCookies||{})[resolved.sessionData.selectedArea];
        if(value) proxyReq.setHeader('cookie',value); else proxyReq.removeHeader('cookie');
    },
    onError: (err, req, res) => {
        if (typeof res.writeHead !== 'function') { res.destroy(); return; }
        if (res.headersSent) { res.end(); return; }
        res.writeHead(503, {'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
        res.end(page('Area sin conexion','<h1>Área sin conexión</h1><p>El Node-RED de esta área no responde. Las otras áreas siguen disponibles.</p><a target="_top" href="/dashboard/">Volver al panel principal</a>'));
    },
    target: 'http://placeholder-nunca-se-usa:1',
    router: async (req) => {
        const resuelto = await resolverSesionYTarget(req);
        req._rzResuelto = resuelto; // usado por onProxyReq/onProxyRes de abajo
        return resuelto ? resuelto.target : '';
    },
    // OJO: con http-proxy-middleware 2.0.10, registrar proxyReq/proxyRes
    // via la opcion "on: {...}" (API nueva) hace que responseInterceptor
    // se cuelgue indefinidamente (probado y confirmado) -- hay que usar
    // las claves "onProxyReq"/"onProxyRes" de nivel superior (API vieja,
    // pero la unica que funciona bien con selfHandleResponse aca).
    onProxyReq: (proxyReq, req) => {
        const resuelto = req._rzResuelto;
        const cookieVal = resuelto && (resuelto.sessionData.edgeCookies || {})[resuelto.sessionData.selectedArea];
        if (cookieVal) proxyReq.setHeader('cookie', cookieVal);
        else proxyReq.removeHeader('cookie');
    },
    onProxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
        // Nunca reenviar al navegador la cookie de sesion del Edge --
        // es server-side, entre el gateway y ese Edge unicamente.
        delete proxyRes.headers['set-cookie'];
        try {
            const resuelto = req._rzResuelto;
            const areas = (resuelto && resuelto.sessionData.areas) || [];
            const contentType = proxyRes.headers['content-type'] || '';
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && String(proxyRes.headers.location||'').includes('riego-login')) {
                res.setHeader('Location','/gateway/reconnect');
            }

            // Si el Edge devuelve 401 "No autenticado" es casi siempre porque
            // la cookie de sesion que le guardamos al loguearse quedo vieja/
            // invalida ahi (ver establecerSesionEdge) -- el usuario SIGUE
            // logueado en el gateway, solo hay que avisarle que tiene que
            // volver a entrar para renovarla, no mostrar el error crudo.
            if (proxyRes.statusCode === 401 && contentType.includes('application/json')) {
                try {
                    const body = JSON.parse(responseBuffer.toString('utf8'));
                    body.error = 'Tu sesion en este sitio se venció -- cerrá sesion (Salir) y volvé a entrar.';
                    return JSON.stringify(body);
                } catch (e) { /* no era JSON de verdad, se reenvia tal cual abajo */ }
            }

            if (contentType.includes('text/html')) {
                // La barra de seleccion de area se hornea en el HTML segun
                // la sesion de ESTE momento -- si el navegador cachea esta
                // pagina, la proxima vez que la sirva desde la cache (en
                // vez de pedirla de nuevo) va a mostrar la etiqueta del
                // area vieja aunque el usuario ya haya cambiado de area
                // (los datos en vivo si se actualizan porque el WebSocket
                // reconecta y lee la sesion actual -- por eso el sintoma es
                // "dice Casa Principal pero los datos son de Casa Norte").
                // OJO: mutar proxyRes.headers aca NO alcanza -- responseInterceptor
                // ya copio los headers de la respuesta original a "res" antes de
                // llamar a este callback, asi que hay que pisarlos en "res"
                // directamente para que el navegador los reciba de verdad.
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                res.setHeader('Pragma', 'no-cache');

                let html = responseBuffer.toString('utf8');
                let cambiado = false;

                // El dashboard de Node-RED es una PWA (workbox) -- si el
                // navegador le llega a instalar un service worker, este
                // puede servir la pagina cacheada por su cuenta SIN pasar
                // por la red en absoluto, sin importar los headers
                // Cache-Control de arriba (son capas distintas). Eso deja
                // ver una etiqueta de area vieja con datos de otra area
                // (el WebSocket si reconecta fresco, la parte estatica no).
                // No alcanza con desregistrarlo -- el bundle de la app lo
                // vuelve a registrar solo unos segundos despues, en cuanto
                // carga. Hay que pisar navigator.serviceWorker.register
                // ANTES de que el bundle de la app corra (por eso va justo
                // al abrir <head>, antes que cualquier otro <script>) para
                // que ese registro nuevo directamente no pase.
                if (html.includes('<head')) {
                    // Whole-page templates grow with their contents. A nested auto
                    // scroller here captures touch flings inside the dashboard iframe.
                    const mobileScroll = '<style id="gateway-mobile-scroll">@media (pointer:coarse),(max-width:768px){.nrdb-ui-widget.nrdb-ui-template{overflow:visible!important}}</style>';
                    html = html.replace(/<head([^>]*)>/, m => m + mobileScroll);
                    const killSw = '<script>if(\'serviceWorker\' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});});navigator.serviceWorker.register=function(){return Promise.reject(new Error(\'service worker deshabilitado (gateway multi-area)\'));};}if(window.caches&&caches.keys){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k);});});}</script>';
                    html = html.replace(/<head([^>]*)>/, (m) => m + killSw);
                    html = html.replace(/<head([^>]*)>/, m=>m+'<script>if(window.self===window.top&&location.pathname.startsWith("/dashboard/")){location.replace("/dashboard/?view="+encodeURIComponent(location.pathname));}</script>');
                    cambiado = true;
                }

                if (areas.length > 0) {
                    const barra = barraSelectorHtml(areas, resuelto.sessionData.selectedArea);
                    if (html.includes('<body')) {
                        html = html.replace(/<body([^>]*)>/, (m) => m + barra);
                        html = html.replace(/<body([^>]*)>/, m=>m+'<script>if(window.self!==window.top){document.addEventListener("DOMContentLoaded",function(){var b=document.getElementById("rz-gateway-bar");if(b)b.style.display="none";});}</script>');
                        cambiado = true;
                    }
                }

                if (cambiado) return html;
            }
        } catch (err) {
            console.warn('[water-gateway] fallo reescribiendo respuesta, se reenvia sin cambios:', err.message);
        }
        return responseBuffer;
    })
});

app.use((req, res, next) => {
    // Si el router (arriba) no pudo resolver area/target, cortar con un
    // error claro en vez de dejar que el proxy intente contra el target
    // "placeholder" (nunca deberia pasar si el gate anterior ya valido
    // sesion+area, pero cubre el caso de un area sin internal_url).
    if (req.session && req.session.selectedArea) {
        const area = (req.session.areas || []).find(a => a.id === req.session.selectedArea);
        if (!area) {
            return res.status(403).send('Area no asignada');
        }
    }
    next();
});

app.use(proxy);

const server = http.createServer(app);
server.listen(PORT, process.env.BIND_HOST || '0.0.0.0', () => {
    console.log(`[water-gateway] escuchando en :${PORT}, Hub en ${HUB_URL}`);
});
