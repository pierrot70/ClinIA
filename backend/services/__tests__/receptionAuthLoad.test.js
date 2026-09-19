import { describe, expect, it, vi } from 'vitest';
import { createHandlerDrain, trackAuthHandlers, stopAndDrainServer, assertLocalMongo, assertOwnedDatabase, namespaceModels, runWorkers, loadProfile, formatProgress, formatSummary } from '../../scripts/reception-auth-load.mjs';
import mongoose from 'mongoose';

describe('reception auth load safety', () => {
    it('formats progress including in-flight logouts without implying an error', () => {
        const text = formatProgress({ login200: 110, logout200: 102, login429: 0, errors: 0 }, 60, 300);
        expect(text).toContain('1 min 00 s / 5 min 00 s | 20%');
        expect(text).toContain('A fermer : 8');
        expect(text).toContain('Erreurs : 0');
    });
    it('formats the supplied successful run as a compact readable summary', () => {
        const text = formatSummary({ users: 10, durationSeconds: 300, maxAttempts: 1000000, metrics: {
            login200: 540, logout200: 540, login429: 0, errors: 0, elapsedSeconds: 305.06,
            loginMs: { p95Ms: 5821 }, logoutMs: { p95Ms: 222 },
        }, auditLogins: 540, auditLogouts: 540, remainingActiveRefreshSessions: 0, cleanup: true }, true);
        for (const expected of ['TEST REUSSI', '5 min 00 s / 5 min 05 s', '1 000 000', '540 / 540  OK', '5,82 s', '0,22 s', 'CONFIRME']) expect(text).toContain(expected);
    });
    it('does not label missing results or failed cleanup as a success', () => {
        for (const report of [{ cleanup: true }, { metrics: {}, cleanup: false }]) {
            const text = formatSummary(report, true);
            expect(text).not.toContain('TEST REUSSI');
            expect(text).toContain('N/D');
        }
        const text = formatSummary({ metrics: { login200: 3, login429: 10 }, auditLogins: 2, interrupted: true }, false);
        expect(text).toContain('ECART !');
        expect(text).toContain('Quota atteint');
        expect(text).toContain('Test interrompu');
        expect(text).toContain('NON CONFIRME !');
    });
    it('keeps the normal quota by default and offers only one explicit sustained profile', () => {
        expect(loadProfile()).toEqual({ durationSeconds: 120, maxAttempts: 100 });
        expect(loadProfile('--five-minutes')).toEqual({ durationSeconds: 300, maxAttempts: 1000000 });
        expect(() => loadProfile('production')).toThrow();
    });
    it('isolates both default and explicitly named collections without altering schemas', () => {
        const instance = new mongoose.Mongoose();
        const prefix = 'clinia_auth_load_' + 'b'.repeat(32);
        namespaceModels(instance, prefix);
        const schema = new instance.Schema({ value: String }, { collection: 'explicit' });
        expect(instance.model('Explicit', schema).collection.name).toBe(prefix + '_explicit');
        expect(schema.options.collection).toBe('explicit');
        expect(instance.model('Default', new instance.Schema({})).collection.name).toBe(prefix + '_defaults');
        expect(instance.model('Override', new instance.Schema({}), 'chosen').collection.name).toBe(prefix + '_chosen');
        expect(() => namespaceModels(instance, prefix)).toThrow();
    });
    it('accepts only the fixed local replica set hosts', () => {
        expect(() => assertLocalMongo('mongodb://fixture:password@mongo-rs-1:27017,mongo-rs-2:27017/clinia?replicaSet=rs0')).not.toThrow();
        for (const uri of ['mongodb://localhost/clinia', 'mongodb+srv://cloud/clinia', 'mongodb://mongo-rs-1.evil/clinia', 'mongodb://mongo-rs-1:27017,remote/clinia', '']) expect(() => assertLocalMongo(uri)).toThrow();
    });
    it('refuses cleanup of a non-owned database', () => {
        const name = 'clinia_auth_load_' + 'a'.repeat(32);
        expect(() => assertOwnedDatabase(name, name)).not.toThrow();
        expect(() => assertOwnedDatabase('clinia', name)).toThrow();
        expect(() => assertOwnedDatabase('clinia', 'clinia')).toThrow();
    });
    it('starts ten workers concurrently and logs out each successful session', async () => {
        let arrivals = 0, release, stopped = false;
        const gate = new Promise(resolve => { release = resolve; });
        const result = await runWorkers({
            accounts: Array.from({ length: 10 }, (_, i) => ({ username: `fixture${i}`, password: 'secret' })),
            durationMs: 1000, stopped: () => stopped,
            request: async (endpoint, _body, token) => {
                if (endpoint === 'login') { arrivals++; if (arrivals === 10) { stopped = true; release(); } await gate; return { status: 200, data: { accessToken: 'token' } }; }
                expect(token).toBe('token'); return { status: 200 };
            },
        });
        expect(result).toMatchObject({ login200: 10, logout200: 10, errors: 0 });
    });
    it('respects Retry-After without sending more requests before the deadline', async () => {
        let clock = 0, requests = 0;
        const result = await runWorkers({ accounts: [{}], durationMs: 120000, now: () => clock, wait: async ms => { clock += ms; }, request: async () => { requests++; return { status: 429, retryAfter: '900' }; } });
        expect(requests).toBe(1);
        expect(result).toMatchObject({ login429: 1, errors: 0, elapsedSeconds: 120 });
    });
    it('stops on unexpected errors', async () => {
        const result = await runWorkers({ accounts: [{}], request: async () => ({ status: 401 }) });
        expect(result).toMatchObject({ errors: 1, login200: 0 });
    });
    it('reports failed logout without retry storms', async () => {
        const result = await runWorkers({ accounts: [{}], request: async endpoint => endpoint === 'login' ? { status: 200, data: { accessToken: 'token' } } : { status: 500 } });
        expect(result).toMatchObject({ errors: 1, login200: 1, logout200: 0 });
    });
});


describe('load runner handler drain', () => {
    it('waits for the business promise even after the client disconnects and stops admission', async () => {
        const drain = createHandlerDrain();
        let finish, closeCallback;
        const work = new Promise(resolve => { finish = resolve; });
        let written = false;
        const handler = drain.wrap(async () => { await work; written = true; });
        const handlerResult = handler({}, {}, vi.fn());
        const server = { close: vi.fn(callback => { closeCallback = callback; }), closeAllConnections: vi.fn(() => closeCallback()) };
        let completed = false;
        const stopping = stopAndDrainServer(server, drain).then(result => { completed = true; return result; });
        const next = vi.fn();
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        drain.admit({}, res, next);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(next).not.toHaveBeenCalled();
        await Promise.resolve();
        expect(completed).toBe(false);
        expect(written).toBe(false);
        finish();
        await handlerResult;
        expect(await stopping).toBe(true);
        expect(written).toBe(true);
    });
    it('bounds the drain and marks unfinished writes unsafe for collection cleanup', async () => {
        const drain = createHandlerDrain();
        let finish;
        const handler = drain.wrap(() => new Promise(resolve => { finish = resolve; }));
        const work = handler({}, {}, vi.fn());
        let callback;
        const server = { close: done => { callback = done; }, closeAllConnections: () => callback() };
        expect(await stopAndDrainServer(server, drain, 5)).toBe(false);
        finish(); await work;
        expect(await drain.wait(5)).toBe(true);
        expect(formatSummary({ handlersDrained: false }, false)).toContain('collections conservees');
    });
    it('does not hang if the HTTP server never confirms closure', async () => {
        const server = { close: vi.fn(), closeAllConnections: vi.fn() };
        expect(await stopAndDrainServer(server, createHandlerDrain(), 5)).toBe(false);
    });
    it('tracks nested async middleware through next and forwards rejections', async () => {
        const drain = createHandlerDrain();
        let finish;
        const error = new Error('test failure');
        const next = vi.fn();
        const router = { stack: [{ route: { stack: [{ handle: async (_req, _res, next) => next() }, { handle: async () => { await new Promise(resolve => { finish = resolve; }); throw error; } }] } }] };
        trackAuthHandlers(router, drain);
        const [first, second] = router.stack[0].route.stack;
        let secondWork;
        await first.handle({}, {}, () => { secondWork = second.handle({}, {}, next); });
        expect(await drain.wait(5)).toBe(false);
        finish(); await secondWork;
        expect(next).toHaveBeenCalledWith(error);
        expect(await drain.wait(5)).toBe(true);
    });
});
