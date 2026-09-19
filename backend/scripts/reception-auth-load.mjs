import { randomUUID, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const number = value => Number.isFinite(value) ? value.toLocaleString('fr-CA').replace(/[\u00a0\u202f]/g, ' ') : 'N/D';
const duration = seconds => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)} min ${String(Math.floor(seconds % 60)).padStart(2, '0')} s` : 'N/D';
const latencyLabel = ms => Number.isFinite(ms) ? `${(ms / 1000).toFixed(2).replace('.', ',')} s` : 'N/D';

export function formatProgress(metrics, elapsed, planned) {
    const percent = Math.min(100, Math.floor(100 * elapsed / planned));
    return `[${duration(elapsed)} / ${duration(planned)} | ${percent}%] ` +
        `Connexions : ${number(metrics.login200)} | Deconnexions : ${number(metrics.logout200)} | ` +
        `A fermer : ${number(Math.max(0, metrics.login200 - metrics.logout200))} | ` +
        `Refus 429 : ${number(metrics.login429)} | Erreurs : ${number(metrics.errors)}`;
}

export function formatSummary(report, passed) {
    const m = report.metrics;
    const successful = passed && Boolean(m) && report.cleanup === true;
    const row = (label, value) => `  ${label.padEnd(34)} ${value}`;
    const journal = (count, expected) => count == null || expected == null ? 'N/D' : `${number(count)} / ${number(expected)}${count === expected ? '  OK' : '  ECART !'}`;
    return [
        '', '============================================================',
        successful ? '  BILAN : TEST REUSSI' : '  BILAN : ECHEC OU VALIDATION INCOMPLETE',
        '============================================================',
        row('Utilisateurs RECEPTION', number(report.users)),
        row('Duree prevue / mesuree', `${duration(report.durationSeconds)} / ${duration(m?.elapsedSeconds)}`),
        '  (La duree mesuree inclut la fin des requetes en cours.)',
        row('Quota de test / IP / 15 min', number(report.maxAttempts)),
        '', '  ACTIVITE',
        row('Connexions reussies', number(m?.login200)),
        row('Deconnexions reussies', number(m?.logout200)),
        row('Refus de quota (HTTP 429)', number(m?.login429)),
        row('Erreurs inattendues', number(m?.errors)),
        ...(m?.login429 > 0 ? ['  Quota atteint : les boucles respectent Retry-After et attendent.'] : []),
        '', '  TEMPS DE REPONSE (95 % des demandes sous ce seuil)',
        row('Connexion', latencyLabel(m?.loginMs?.p95Ms)),
        row('Deconnexion', latencyLabel(m?.logoutMs?.p95Ms)),
        '  Connexion : delais volontaires inclus ; refus 429 inclus, si presents.',
        '', '  VERIFICATIONS',
        row('Journaux de connexion', journal(report.auditLogins, m?.login200)),
        row('Journaux de deconnexion', journal(report.auditLogouts, m?.logout200)),
        row('Sessions refresh encore actives', number(report.remainingActiveRefreshSessions)),
        row('Nettoyage des donnees du test', report.cleanup === true ? 'CONFIRME' : 'NON CONFIRME !'),
        ...(report.handlersDrained === false ? ['  Traitements encore actifs : collections conservees, nettoyage manuel requis.'] : []),
        ...(report.interrupted ? ['  Test interrompu : les resultats ne couvrent pas la duree prevue.'] : []),
        '============================================================',
        '  Perimetre : serveur auth et collections isoles dans staging.',
        '  Ce resultat ne mesure pas la capacite maximale de ClinIA.',
    ].join('\n');
}

export function loadProfile(mode) {
    if (mode === undefined) return { durationSeconds: 120, maxAttempts: 100 };
    if (mode === '--five-minutes') return { durationSeconds: 300, maxAttempts: 1000000 };
    throw new Error('Unknown load profile');
}

export function assertLocalMongo(uri) {
    const authority = /^mongodb:\/\/([^/?]+)(?:\/|\?|$)/.exec(uri || '')?.[1];
    const hosts = authority?.slice(authority.lastIndexOf('@') + 1).split(',');
    if (!hosts?.length || !hosts.every(host => /^mongo-rs-[123](?::27017)?$/.test(host))) {
        throw new Error('Expected the local staging replica set');
    }
}
export function assertOwnedDatabase(actual, expected) {
    if (!/^clinia_auth_load_[a-f0-9]{32}$/.test(expected) || actual !== expected) throw new Error('Unsafe cleanup target');
}

export function namespaceModels(mongoose, prefix) {
    assertOwnedDatabase(prefix, prefix);
    if (Object.keys(mongoose.models).length) throw new Error('Models already compiled');
    const original = mongoose.model.bind(mongoose);
    const pluralize = mongoose.pluralize();
    mongoose.model = (name, schema, collection, ...options) => schema
        ? original(name, schema, `${prefix}_${collection || schema.options.collection || pluralize(name)}`, ...options)
        : original(name);
}

// Count handler promises rather than HTTP connections: an aborted client does
// not cancel a login's MongoDB writes. Used only by this isolated test process.
export function createHandlerDrain() {
    let accepting = true, active = 0;
    const listeners = new Set();
    const done = () => { active--; if (active === 0) for (const notify of listeners) notify(true); };
    return {
        admit(_req, res, next) {
            if (!accepting) return res.status(503).json({ error: { code: 'TEST_DRAINING' } });
            next();
        },
        stop() { accepting = false; },
        wrap(handler) {
            return function trackedHandler(req, res, next) {
                active++;
                try {
                    const result = handler(req, res, next);
                    if (result && typeof result.then === 'function') {
                        return Promise.resolve(result).catch(next).finally(done);
                    }
                    done();
                    return result;
                } catch (error) { done(); return next(error); }
            };
        },
        async wait(timeoutMs = 60000) {
            if (active === 0) return true;
            return new Promise(resolve => {
                const finish = result => { clearTimeout(timer); listeners.delete(finish); resolve(result); };
                const timer = setTimeout(() => finish(false), timeoutMs);
                listeners.add(finish);
            });
        },
    };
}

export function trackAuthHandlers(router, drain) {
    for (const layer of router.stack) {
        // All auth route middleware are synchronous or return their work promise.
        // Fail closed if this isolated runner encounters an unsupported router.
        if (!layer.route) throw new Error('Unexpected auth router middleware');
        for (const handler of layer.route.stack) {
            if (handler.handle.length === 4) throw new Error('Unexpected auth error handler');
            handler.handle = drain.wrap(handler.handle);
        }
    }
}

export async function stopAndDrainServer(server, drain, timeoutMs = 60000) {
    drain.stop();
    if (!server) return true;
    const closed = new Promise(resolve => server.close(resolve));
    const drained = await drain.wait(timeoutMs);
    server.closeAllConnections();
    const socketsClosed = await new Promise(resolve => {
        const timer = setTimeout(() => resolve(false), Math.min(timeoutMs, 1000));
        closed.then(() => { clearTimeout(timer); resolve(true); });
    });
    return drained && socketsClosed;
}

// Ten sequential sessions in parallel; no client retries that amplify failures.
export async function runWorkers({ accounts, request, durationMs = 120000, stopped = () => false, now = () => performance.now(), wait = ms => new Promise(r => setTimeout(r, ms)), progress = () => {} }) {
    const started = now(), deadline = started + durationMs;
    const metrics = { login200: 0, login429: 0, logout200: 0, errors: 0, loginMs: [], logoutMs: [] };
    let failed = false;
    await Promise.all(accounts.map(async account => {
        while (!failed && !stopped() && now() < deadline) {
            let token, cookie;
            try {
                const start = now();
                const login = await request('login', { username: account.username, password: account.password });
                metrics.loginMs.push(now() - start);
                if (login.status === 429) {
                    metrics.login429++;
                    // Respect Retry-After, but stop at the overall deadline or signal.
                    const retryMs = Math.max(1000, (Number(login.retryAfter) || 1) * 1000);
                    const until = Math.min(deadline, now() + retryMs);
                    while (!stopped() && !failed && now() < until) await wait(Math.min(250, until - now()));
                    continue;
                }
                token = login.data?.accessToken; cookie = login.cookie;
                if (login.status !== 200 || !token) throw new Error('Login failed');
                metrics.login200++;
            } catch { metrics.errors++; failed = true; }
            finally {
                if (token) {
                    try {
                        const start = now();
                        const logout = await request('logout', {}, token, cookie);
                        metrics.logoutMs.push(now() - start);
                        if (logout.status !== 200) throw new Error('Logout failed');
                        metrics.logout200++;
                    } catch { metrics.errors++; failed = true; }
                }
            }
            progress(metrics);
        }
    }));
    return { ...metrics, elapsedSeconds: +( (now() - started) / 1000 ).toFixed(2) };
}

async function main() {
    if (process.argv.length > 4) throw new Error('Too many arguments');
    const profile = loadProfile(process.argv[3]);
    if (process.argv[2] !== '--run' || process.env.CLINIA_AUTH_LOAD_TEST !== '1' || process.env.NODE_ENV === 'production' || process.env.CLINIA_INSTANCE_ID !== 'mongo-rs-test-backend') throw new Error('Local staging launcher required');
    assertLocalMongo(process.env.MONGO_URI);
    const dbName = `clinia_auth_load_${randomUUID().replaceAll('-', '')}`;
    console.log(`Identifiant des collections temporaires : ${dbName}`);
    // New process only: never alter the running staging backend's configuration.
    process.env.JWT_SECRET = randomBytes(48).toString('hex');
    process.env.CLINIA_REQUIRE_MFA_FOR_PRIVILEGED = 'false';
    const { default: mongoose } = await import('mongoose');
    mongoose.set('autoCreate', false);
    mongoose.set('autoIndex', false);
    namespaceModels(mongoose, dbName);
    const { default: express } = await import('express');
    const { default: bcrypt } = await import('bcryptjs');
    const { AdminUser } = await import('../models/AdminUser.js');
    const { AuthAuditLog } = await import('../models/AuthAuditLog.js');
    const { RefreshTokenSession } = await import('../models/RefreshTokenSession.js');
    const { configureCoreMiddleware } = await import('../app/configureCoreMiddleware.js');
    const { createAuthRouter } = await import('../routes/auth.js');
    const { createLoginRateLimiter } = await import('../middleware/loginRateLimiter.js');
    const authRouter = createAuthRouter({ loginLimiter: createLoginRateLimiter({ maxAttempts: profile.maxAttempts }) });
    const handlerDrain = createHandlerDrain();
    trackAuthHandlers(authRouter, handlerDrain);
    let server, connected = false, created = false, timer, stop = false, cleanup = false;
    let collectionNames = [];
    process.on('SIGINT', () => { stop = true; });
    process.on('SIGTERM', () => { stop = true; });
    const report = { collectionPrefix: dbName, users: 10, ...profile, startedAt: new Date().toISOString(), scenario: 'isolated auth HTTP server and namespaced collections; same staging MongoDB; shared IP; explicit test-only login ceiling' };
    try {
        mongoose.set('bufferCommands', false);
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
        connected = true;
        collectionNames = Object.values(mongoose.models).map(model => model.collection.name);
        if (!collectionNames.length || collectionNames.some(name => !name.startsWith(dbName + '_'))) throw new Error('Model isolation failed');
        // Never adopt or erase any pre-existing collection.
        if ((await mongoose.connection.db.listCollections({ name: { $in: collectionNames } }).toArray()).length) throw new Error('Collections already exist');
        created = true;
        for (const model of Object.values(mongoose.models)) { await model.createCollection(); await model.createIndexes(); }
        const accounts = Array.from({ length: 10 }, (_, i) => ({ username: `reception_load_${i + 1}`, password: randomBytes(24).toString('base64url') }));
        for (const account of accounts) await AdminUser.create({ username: account.username, email: `${account.username}@load.invalid`, passwordHash: await bcrypt.hash(account.password, 12), role: 'RECEPTION', isActive: true, mfaRequired: false });
        const app = express();
        configureCoreMiddleware(app);
        app.use('/api/auth', handlerDrain.admit, authRouter);
        app.use((_error, _req, res, _next) => res.status(500).json({ error: { code: 'TEST_ERROR' } }));
        server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}/api/auth/`;
        async function request(endpoint, body, token, cookie) {
            const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:5174' };
            if (token) headers.Authorization = `Bearer ${token}`;
            if (cookie) headers.Cookie = cookie;
            const response = await fetch(base + endpoint, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(10000) });
            const json = await response.json();
            return { status: response.status, data: json.data, retryAfter: response.headers.get('retry-after'), cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
        }
        let current = { login200: 0, login429: 0, logout200: 0, errors: 0 };
        const loadStarted = performance.now();
        console.log('\nPROGRESSION (toutes les 10 secondes)');
        console.log('A fermer = connexions reussies dont la deconnexion est encore en cours.');
        timer = setInterval(() => console.log(formatProgress(current, (performance.now() - loadStarted) / 1000, profile.durationSeconds)), 10000);
        const metrics = await runWorkers({ accounts, request, durationMs: profile.durationSeconds * 1000, stopped: () => stop, progress: value => { current = value; } });
        clearInterval(timer);
        const latency = values => { const sorted = [...values].sort((a,b) => a-b); return { count: sorted.length, p95Ms: Math.round(sorted[Math.floor(sorted.length * .95)] || 0) }; };
        report.metrics = { ...metrics, loginMs: latency(metrics.loginMs), logoutMs: latency(metrics.logoutMs) };
        report.interrupted = stop;
        report.handlersDrained = await stopAndDrainServer(server, handlerDrain);
        server = undefined;
        if (!report.handlersDrained) throw new Error('Handlers did not drain');
        report.auditLogins = await AuthAuditLog.countDocuments({ action: 'LOGIN', outcome: 'SUCCESS' });
        report.auditLogouts = await AuthAuditLog.countDocuments({ action: 'LOGOUT', outcome: 'SUCCESS' });
        report.remainingActiveRefreshSessions = await RefreshTokenSession.countDocuments({ status: 'ACTIVE', revokedAt: null, expiresAt: { $gt: new Date() } });
        if (metrics.errors || stop || metrics.login200 !== metrics.logout200 || report.auditLogins !== metrics.login200 || report.auditLogouts !== metrics.logout200 || report.remainingActiveRefreshSessions) process.exitCode = 1;
        if (profile.maxAttempts === 1000000 && (metrics.login429 || metrics.login200 <= 100)) process.exitCode = 1;
    } catch { report.error = 'Test failed; raw errors and secrets withheld'; process.exitCode = 1; }
    finally {
        clearInterval(timer);
        if (server) report.handlersDrained = await stopAndDrainServer(server, handlerDrain);
        if (connected && created && report.handlersDrained !== false) {
            try {
                assertOwnedDatabase(dbName, dbName);
                for (const name of collectionNames) {
                    if (!name.startsWith(dbName + '_')) throw new Error('Unsafe collection target');
                    try { await mongoose.connection.db.dropCollection(name); }
                    catch (error) { if (error.code !== 26) throw error; }
                }
                cleanup = (await mongoose.connection.db.listCollections({ name: { $in: collectionNames } }).toArray()).length === 0;
            } catch { cleanup = false; }
        }
        // On drain timeout, retain every run-owned collection and terminate the
        // isolated process after reporting; never race a drop against live writes.
        if (report.handlersDrained !== false) await mongoose.disconnect();
        report.cleanup = cleanup; report.finishedAt = new Date().toISOString();
        if (!cleanup) process.exitCode = 1;
        console.log(formatSummary(report, !process.exitCode));
        console.log(cleanup ? 'CLEANUP_OK : collections temporaires supprimees, comptes staging existants intacts.' : `NETTOYAGE NON CONFIRME : verifier uniquement les collections ${dbName}_*`);
        if (report.handlersDrained === false) process.exit(1);
    }
}
if (process.argv[1] && (import.meta.url === pathToFileURL(process.argv[1]).href || (process.argv[1] === '-' && process.env.CLINIA_AUTH_LOAD_TEST === '1'))) {
    main().catch(() => { console.error('Test refuse ou initialisation impossible. Aucun detail sensible affiche.'); process.exitCode = 1; });
}
