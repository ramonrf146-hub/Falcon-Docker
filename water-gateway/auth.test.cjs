// HTTP regression tests with in-memory sessions and simulated Hub/Edges.
// Run in the gateway image: node /workspace/water-gateway/auth.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const http = require('node:http');
const { createRequire } = require('node:module');
const requireApp = createRequire('/app/server.js');
const session = requireApp('express-session');

test('initial password gate, Safari form and password change', async () => {
    let mustChange = true;
    let currentPassword = 'Initial-Test-123';
    let edgeLogins = 0;
    let listener;
    let proxyOptions;
    const store = new session.MemoryStore();
    const pool = { query: async (sql) => {
        if (sql.includes('must_change_password')) return { rows: [{ must_change_password: mustChange }] };
        if (sql.includes('SELECT internal_url')) return { rows: [{ internal_url: 'http://edge' }] };
        return { rows: [{ id: 'test-area', name: 'Test area', internal_url: 'http://edge' }] };
    }};
    const fakeFetch = async (url, opts) => {
        const body = JSON.parse(opts.body);
        const answer = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
        if (url.endsWith('/login-direct')) {
            if (body.username !== 'ramon' || body.password !== currentPassword) return answer({ ok: false, error: 'Usuario o contrasena incorrectos' }, 401);
            return answer({ ok: true, user: { id: 1, username: 'ramon', role: 'admin', mustChangePassword: mustChange }, areas: [{ id: 'test-area' }] });
        }
        if (url.endsWith('/change-password-direct')) {
            if (body.currentPassword !== currentPassword) return answer({ ok: false, error: 'Contrasena actual incorrecta' }, 400);
            assert.equal(body.user_id, 1);
            currentPassword = body.newPassword; mustChange = false;
            return answer({ ok: true });
        }
        edgeLogins++;
        return new Response('{}', { headers: { 'set-cookie': 'edge_sid=test; HttpOnly' } });
    };
    const context = vm.createContext({
        require: name => {
            if (name === 'pg') return { Pool: function () { return pool; } };
            if (name === 'connect-pg-simple') return () => function () { return store; };
            if (name === 'http-proxy-middleware') return {
                createProxyMiddleware: opts => { proxyOptions = opts; return (req, res) => res.send('DASHBOARD'); },
                responseInterceptor: fn => fn
            };
            if (name === 'http') return { createServer: app => { listener = http.createServer(app); return listener; } };
            return requireApp(name);
        },
        process: { env: { PORT: '0', GATEWAY_SHARED_SECRET: 'test-only', GATEWAY_SESSION_SECRET: 'test-session' } },
        console, fetch: fakeFetch, AbortSignal, setTimeout
    });
    vm.runInContext(fs.readFileSync(__dirname + '/server.js', 'utf8'), context);
    if (!listener.listening) await new Promise(resolve => listener.once('listening', resolve));
    const base = 'http://127.0.0.1:' + listener.address().port;
    let cookie = '';
    async function request(path, data) {
        const headers = cookie ? { cookie } : {};
        if (data) headers['content-type'] = 'application/x-www-form-urlencoded';
        const r = await fetch(base + path, { method: data ? 'POST' : 'GET', headers, body: data ? new URLSearchParams(data) : undefined, redirect: 'manual' });
        const setCookie = r.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return { status: r.status, location: r.headers.get('location'), text: await r.text() };
    }
    try {
        let r = await request('/login');
        assert.match(r.text, /autocapitalize="none"/);
        assert.match(r.text, /autocomplete="current-password"/);
        r = await request('/login', { username: 'ramon', password: 'wrong' });
        assert.match(r.text, /incorrectos/);
        r = await request('/login', { username: ' ramon ', password: currentPassword });
        assert.equal(r.location, '/gateway/change-password');
        assert.equal(edgeLogins, 0);
        for (const path of ['/', '/dashboard/riego', '/api/device/1', '/socket.io/?transport=polling', '/gateway/unknown']) {
            assert.equal((await request(path)).location, '/gateway/change-password', path);
        }
        assert.equal((await request('/gateway/select-area', { area: 'test-area' })).location, '/gateway/change-password');
        assert.equal(await proxyOptions.router({ headers: { cookie } }), '');
        r = await request('/gateway/change-password');
        const csrf = r.text.match(/name="csrf" value="([^"]+)"/)[1];
        const change = { csrf, currentPassword, newPassword: 'Updated-Test-456', confirmPassword: 'Updated-Test-456' };
        assert.equal((await request('/gateway/change-password', { ...change, csrf: 'invalid' })).status, 403);
        assert.equal((await request('/gateway/change-password', { ...change, confirmPassword: 'mismatch' })).status, 400);
        assert.equal((await request('/gateway/change-password', { ...change, newPassword: currentPassword, confirmPassword: currentPassword })).status, 400);
        assert.equal((await request('/gateway/change-password', { ...change, currentPassword: 'wrong' })).status, 400);
        assert.equal(mustChange, true);
        r = await request('/gateway/change-password', change);
        assert.match(r.text, /Contrasena actualizada/);
        assert.equal(mustChange, false);
        assert.equal((await request('/dashboard/riego')).location, '/login');
        assert.match((await request('/login', { username: 'ramon', password: 'Initial-Test-123' })).text, /incorrectos/);
        assert.equal((await request('/login', { username: 'ramon', password: currentPassword })).location, '/');
        assert.equal(edgeLogins, 1);
        assert.equal((await request('/dashboard/riego')).text, 'DASHBOARD');
        assert.equal(await proxyOptions.router({ headers: { cookie } }), 'http://edge');
        // Existing sessions must not bypass a reset made by an administrator.
        mustChange = true;
        assert.equal(await proxyOptions.router({ headers: { cookie } }), '');
        assert.equal((await request('/dashboard/riego')).location, '/gateway/change-password');
    } finally {
        listener.closeAllConnections();
        await new Promise(resolve => listener.close(resolve));
    }
});

test('Hub direct password change validates secret/current password and updates atomically', async () => {
    const flow = JSON.parse(fs.readFileSync(__dirname + '/../nodered/hub-flow-backup/flows.json', 'utf8'));
    const code = flow.find(n => n.id === 'hubg_password_fn').func;
    let stored = 'hash:Initial-Test-123';
    let updates = 0;
    async function run(body, secret = 'test-only') {
        return new Promise((resolve, reject) => {
            const msg = { req: { headers: { 'x-gateway-secret': secret } }, payload: body };
            const ctx = {
                msg, env: { get: () => 'test-only' }, node: { send: resolve },
                bcrypt: { compareSync: (p, h) => 'hash:' + p === h, hashSync: p => 'hash:' + p },
                global: { get: () => ({ query: async (sql, args) => {
                    if (sql.startsWith('SELECT')) return { rows: [{ password_hash: stored }] };
                    assert.match(sql, /AND password_hash=\$3/);
                    assert.equal(args[2], stored);
                    stored = args[0]; updates++;
                    return { rowCount: 1 };
                } }) }
            };
            try { const result = vm.runInNewContext('(function(){' + code + '})()', ctx); if (result) resolve(result); } catch (err) { reject(err); }
        });
    }
    const body = { user_id: 1, currentPassword: 'Initial-Test-123', newPassword: 'Updated-Test-456' };
    assert.equal((await run(body, 'wrong')).statusCode, 401);
    assert.equal((await run({ ...body, currentPassword: 'wrong' })).statusCode, 400);
    assert.equal((await run({ ...body, newPassword: 'short' })).statusCode, 400);
    assert.equal((await run({ ...body, newPassword: body.currentPassword })).statusCode, 400);
    assert.equal(updates, 0);
    assert.equal((await run(body)).statusCode, 200);
    assert.equal(updates, 1);
    assert.equal((await run(body)).statusCode, 400);
});
