// Run inside the Hub container; creates and removes one temporary user.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('/data/node_modules/pg');
const bcrypt = require('/data/node_modules/bcryptjs');
const pool = new Pool({ host: process.env.POSTGRES_HOST, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB });
const username = 'codex_auth_' + crypto.randomBytes(6).toString('hex');
const initial = crypto.randomBytes(18).toString('base64url');
const changed = crypto.randomBytes(18).toString('base64url');
let userId;
let cookie = '';
const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
async function request(path, data, base = 'http://gateway:3000', ua = safari) {
    const headers = { 'user-agent': ua };
    if (cookie) headers.cookie = cookie;
    if (data) headers['content-type'] = 'application/x-www-form-urlencoded';
    const res = await fetch(base + path, { method: data ? 'POST' : 'GET', headers, body: data ? new URLSearchParams(data) : undefined, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
}
(async () => {
    try {
        const result = await pool.query('INSERT INTO riego_hub.users (username,password_hash,role,must_change_password) VALUES ($1,$2,$3,true) RETURNING id', [username, bcrypt.hashSync(initial, 10), 'estandar']);
        userId = result.rows[0].id;
        // Casa Sur has no running Edge: verifies password changes are independent of site availability.
        await pool.query('INSERT INTO riego_hub.user_areas (user_id,area_id) VALUES ($1,$2)', [userId, 'casa-sur']);
        let r = await request('/login', { username, password: initial });
        assert.equal(r.location, '/gateway/change-password');
        assert.equal((await request('/dashboard/riego')).location, '/gateway/change-password');
        const form = await request('/gateway/change-password');
        const csrf = form.text.match(/name="csrf" value="([^"]+)"/)[1];
        const payload = { csrf, currentPassword: initial, newPassword: changed, confirmPassword: changed };
        assert.equal((await request('/gateway/change-password', { ...payload, currentPassword: 'wrong-password' })).status, 400);
        r = await request('/gateway/change-password', payload);
        assert.match(r.text, /Contrasena actualizada/);
        const state = await pool.query('SELECT must_change_password FROM riego_hub.users WHERE id=$1', [userId]);
        assert.equal(state.rows[0].must_change_password, false);
        cookie = '';
        assert.match((await request('/login', { username, password: initial })).text, /incorrectos/);
        for (const ua of ['Mozilla/5.0 desktop regression check', safari]) {
            cookie = '';
            r = await request('/login', { username, password: changed }, 'https://water.riegocom.uk', ua);
            assert.equal(r.location, '/');
            assert.equal((await request('/dashboard/riego', undefined, 'https://water.riegocom.uk', ua)).status, 502);
        }
        console.log('PASS: initial-password gate, wrong current password, successful change without Edge, old password rejected, public login with desktop and Safari user agents.');
    } finally {
        if (userId) {
            await pool.query("DELETE FROM riego_hub.gateway_sessions WHERE sess->'user'->>'id'=$1", [String(userId)]);
            await pool.query('DELETE FROM riego_hub.users WHERE id=$1', [userId]);
            console.log('Temporary user and gateway sessions removed.');
        }
        await pool.end();
    }
})().catch(err => { console.error(err.message); process.exitCode = 1; });
