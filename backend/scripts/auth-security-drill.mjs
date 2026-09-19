// Local staging only: real auth routes and Mongo, isolated synthetic collections.
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { assertLocalMongo, assertOwnedDatabase, namespaceModels, createHandlerDrain, trackAuthHandlers, stopAndDrainServer } from './reception-auth-load.mjs';

async function main() {
    if (process.env.CLINIA_AUTH_SECURITY_DRILL !== '1' || process.env.NODE_ENV === 'production' || process.env.CLINIA_INSTANCE_ID !== 'mongo-rs-test-backend') throw new Error('Local staging required');
    assertLocalMongo(process.env.MONGO_URI);
    const prefix = `clinia_auth_load_${randomUUID().replaceAll('-', '')}`;
    console.log(`AUTH_SECURITY_DRILL collections=${prefix}`);
    process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('hex');
    process.env.JWT_SECRET = randomBytes(48).toString('hex');
    process.env.MFA_ENCRYPTION_KEY = randomBytes(48).toString('hex');
    const { default: mongoose } = await import('mongoose');
    mongoose.set('autoCreate', false); mongoose.set('autoIndex', false); mongoose.set('bufferCommands', false);
    namespaceModels(mongoose, prefix);
    const { default: express } = await import('express');
    const { default: bcrypt } = await import('bcryptjs');
    const { AdminUser } = await import('../models/AdminUser.js');
    const { RefreshTokenSession } = await import('../models/RefreshTokenSession.js');
    const { configureCoreMiddleware } = await import('../app/configureCoreMiddleware.js');
    const { createAuthRouter } = await import('../routes/auth.js');
    const { createMfaSecret, createTotp, encryptMfaSecret } = await import('../services/auth/mfa.js');
    const router = createAuthRouter();
    const handlerDrain = createHandlerDrain();
    trackAuthHandlers(router, handlerDrain);
    let server, names = [], owned = false, connected = false, step = 'setup';
    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 }); connected = true;
        names = Object.values(mongoose.models).map(model => model.collection.name);
        assert.ok(names.length && names.every(name => name.startsWith(prefix + '_')));
        assert.equal((await mongoose.connection.db.listCollections({ name: { $in: names } }).toArray()).length, 0);
        owned = true;
        for (const model of Object.values(mongoose.models)) { await model.createCollection(); await model.createIndexes(); }
        const username = 'security_drill_admin', password = randomBytes(24).toString('base64url'), secret = createMfaSecret();
        await AdminUser.create({ username, email: 'security_drill@synthetic.invalid', passwordHash: await bcrypt.hash(password, 12), role: 'SUPERADMIN', isActive: true, mfaEnabled: true, mfaRequired: true, mfaSecretEncrypted: encryptMfaSecret(secret) });
        const app = express(); configureCoreMiddleware(app); app.use('/api/auth', handlerDrain.admit, router);
        app.use((_error, _req, res, _next) => res.status(500).json({ error: { code: 'TEST_ERROR' } }));
        server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
        async function request(path, { body, token, cookie } = {}) {
            const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:5174' };
            if (token) headers.Authorization = `Bearer ${token}`;
            if (cookie) headers.Cookie = cookie;
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/${path}`, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(10000) });
            const json = await response.json();
            return { status: response.status, data: json.data, code: json.error?.code, cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
        }
        async function challenge() {
            const result = await request('login', { body: { username, password } });
            assert.equal(result.status, 202); assert.equal(result.data.mfaRequired, true);
            return result.data.mfaChallenge;
        }
        step = 'MFA positive and replay';
        // Leave sufficient time for both real password-delay paths in one TOTP window.
        const remaining = 30000 - Date.now() % 30000;
        if (remaining < 12000) await new Promise(resolve => setTimeout(resolve, remaining + 50));
        const challengeA = await challenge(), instant = Date.now(), code = createTotp(secret, instant);
        const a = await request('login/mfa', { body: { mfaChallenge: challengeA, code } });
        assert.equal(a.status, 200); assert.ok(a.data.accessToken);
        const challengeB = await challenge();
        const replay = await request('login/mfa', { body: { mfaChallenge: challengeB, code } });
        assert.equal(Math.floor(Date.now() / 30000), Math.floor(instant / 30000), 'Inconclusive: TOTP window changed');
        assert.equal(replay.status, 401); assert.equal(replay.code, 'INVALID_MFA_CODE');
        console.log('PASS MFA_REPLAY HTTP=401 code=INVALID_MFA_CODE same_TOTP_window=true');
        await new Promise(resolve => setTimeout(resolve, 30000 - Date.now() % 30000 + 50));
        const freshCode = createTotp(secret);
        assert.notEqual(freshCode, code, 'Inconclusive: repeated numeric TOTP');
        const b = await request('login/mfa', { body: { mfaChallenge: challengeB, code: freshCode } });
        assert.equal(b.status, 200); assert.ok(b.data.accessToken);
        console.log('PASS MFA_FRESH_CODE HTTP=200');
        step = 'session binding';
        const tokenA = a.data.accessToken, tokenB = b.data.accessToken;
        const initial = await request('users/active', { token: tokenB, cookie: b.cookie });
        assert.equal(initial.status, 403); assert.equal(initial.code, 'REAUTH_REQUIRED');
        const confirmation = await request('reauth', { body: { password }, token: tokenA, cookie: a.cookie });
        assert.equal(confirmation.status, 200);
        assert.equal((await request('users/active', { token: tokenA, cookie: confirmation.cookie })).status, 200);
        const borrowed = await request('users/active', { token: tokenB, cookie: confirmation.cookie });
        assert.equal(borrowed.status, 403); assert.equal(borrowed.code, 'REAUTH_REQUIRED');
        console.log('PASS SESSION_BINDING same_session=200 borrowed_cookie=403');
        step = 'immediate logout';
        assert.equal((await request('session', { token: tokenA })).status, 200);
        assert.equal((await request('logout', { body: {}, token: tokenA, cookie: a.cookie })).status, 200);
        assert.equal((await request('session', { token: tokenA })).status, 401);
        assert.equal((await request('session', { token: tokenB })).status, 200);
        assert.equal((await request('logout', { body: {}, token: tokenB, cookie: b.cookie })).status, 200);
        assert.equal(await RefreshTokenSession.countDocuments({ status: 'ACTIVE', revokedAt: null }), 0);
        console.log('PASS IMMEDIATE_LOGOUT old_access=401 other_session=200 active_refresh=0');
    } catch {
        console.error(`FAIL AUTH_SECURITY_DRILL step=${step}; raw responses and credentials withheld`); process.exitCode = 1;
    } finally {
        // A disconnected HTTP client does not cancel Mongo writes in its handler.
        // Never drop collections while one of those handler promises is alive.
        const drained = await stopAndDrainServer(server, handlerDrain);
        if (!drained) {
            console.error(`CLEANUP_DEFERRED handlers still active; inspect only ${prefix}_*`);
            process.exit(1);
        }
        console.log('HANDLERS_DRAINED before collection cleanup');
        try {
            if (connected && owned) {
                assertOwnedDatabase(prefix, prefix);
                for (const name of names) {
                    assert.ok(name.startsWith(prefix + '_'));
                    try { await mongoose.connection.db.dropCollection(name); } catch (error) { if (error.code !== 26) throw error; }
                }
                assert.equal((await mongoose.connection.db.listCollections({ name: { $in: names } }).toArray()).length, 0);
                console.log('CLEANUP_OK exact synthetic collections removed');
            }
        } catch { console.error(`CLEANUP_FAILED inspect only ${prefix}_*`); process.exitCode = 1; }
        await mongoose.disconnect();
    }
}
main().catch(() => { console.error('AUTH_SECURITY_DRILL refused; no sensitive details emitted'); process.exitCode = 1; });
