#!/usr/bin/env node
// Public HTTP only. Credentials never appear in curl arguments or reports.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';

const exec = promisify(execFile);
const production = 'https://clinique-ai.ca';
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const password = () => `Test-${crypto.randomBytes(24).toString('base64url')}!`;

export async function run({base = production, prompt, report = console.log, cleanupFile} = {}) {
    ensure(base === production || (process.env.NODE_ENV === 'test' && /^http:\/\/127\.0\.0\.1:\d+$/.test(base)), 'Destination refusée.');
    const work = await mkdtemp(path.join(tmpdir(), 'clinia-auth-smoke-'));
    const file = name => path.join(work, name);
    let fixture = {base, username: `smoke-auth-${crypto.randomUUID()}`, userId: null};
    fixture.email = `${fixture.username}@example.invalid`;
    const journal = cleanupFile ? path.resolve(cleanupFile) : file('cleanup.json');
    let created = false, uncertain = false, admin, adminPassword, success = false, cleanupOK = false;
    let interrupted = false;
    const signal = () => { interrupted = true; };
    process.on('SIGINT', signal);
    process.on('SIGTERM', signal);
    const saveJournal = () => writeFile(journal, JSON.stringify(fixture), {mode: 0o600});
    // Never log subprocess errors: they may contain sensitive response bodies.
    async function request(route, expected, {method = 'GET', body, session, capture = false, cleaning = false} = {}) {
        if (interrupted && !cleaning) throw new Error('Test interrompu.');
        const args = ['--disable', '--noproxy', '*', '--silent', '--show-error', '--connect-timeout', '10', '--max-time', '25',
            '--request', method, '--output', file('response'), '--write-out', '%{http_code}', '--header', `Origin: ${base}`];
        if (body !== undefined) {
            await writeFile(file('body'), JSON.stringify(body), {mode: 0o600});
            args.push('--header', 'Content-Type: application/json', '--data-binary', `@${file('body')}`);
        }
        if (session?.token) {
            await writeFile(file('header'), `Authorization: Bearer ${session.token}\n`, {mode: 0o600});
            args.push('--header', `@${file('header')}`);
        }
        if (session?.jar) args.push('--cookie', session.jar);
        const jar = capture ? file(`cookies-${crypto.randomUUID()}`) : undefined;
        if (jar) args.push('--cookie-jar', jar);
        args.push(`${base}/api/${route}`);
        let status;
        try { status = Number((await exec('curl', args)).stdout); }
        catch { uncertain = true; throw new Error('Requête interrompue ou réseau indisponible; résultat serveur incertain.'); }
        if (status >= 500 || status === 408) uncertain = true;
        ensure([].concat(expected).includes(status), `${method} ${route}: HTTP ${status}, attendu ${expected}.`);
        let data;
        try { data = JSON.parse(await readFile(file('response'), 'utf8')); }
        catch { throw new Error('Réponse JSON inattendue.'); }
        return {status, data: data.data, error: data.error, jar};
    }
    function sessionFrom(result) {
        ensure(typeof result.data?.accessToken === 'string' && !/[\r\n]/.test(result.data.accessToken), 'Jeton absent ou invalide.');
        return {token: result.data.accessToken, jar: result.jar};
    }
    async function reauth(cleaning = false) {
        const result = await request('auth/reauth', 200, {method: 'POST', body: {password: adminPassword}, session: admin, capture: true, cleaning});
        admin.jar = result.jar;
    }
    async function loginTest(pw) {
        const result = await request('auth/login', 200, {method: 'POST', body: {username: fixture.username, password: pw}, capture: true});
        ensure(result.data?.user?.id === fixture.userId && result.data.user.role === 'USER', 'Identité de test inattendue.');
        return sessionFrom(result);
    }
    async function current(session, forced) {
        const result = await request('auth/session', 200, {session});
        ensure(result.data?.user?.id === fixture.userId && result.data.user.mustChangePasswordOnNextLogin === forced, 'Session ou obligation de changement incorrecte.');
    }
    async function revoked(session) {
        await request('auth/session', 401, {session});
        const result = await request('auth/refresh', 401, {method: 'POST', body: {}, session: {jar: session.jar}});
        ensure(result.error?.code === 'INVALID_REFRESH_TOKEN', 'Le refus du renouvellement ne correspond pas à un jeton invalidé.');
    }
    async function lookup(cleaning = true) {
        const result = await request(`auth/users?search=${encodeURIComponent(fixture.username)}&limit=100`, 200, {session: admin, cleaning});
        ensure(Array.isArray(result.data?.users), 'Liste de nettoyage invalide.');
        ensure(!result.data.users.some(u => (u.id === fixture.userId || u.username === fixture.username)
            && (u.username !== fixture.username || u.email !== fixture.email || u.role !== 'USER')), 'Identité modifiée; nettoyage automatique refusé.');
        const matches = result.data.users.filter(u => u.username === fixture.username && u.email === fixture.email && u.role === 'USER');
        ensure(matches.length <= 1, 'Identité ambiguë; suppression refusée.');
        if (matches.length) {
            ensure(/^[a-f0-9]{24}$/.test(matches[0].id) && (!fixture.userId || matches[0].id === fixture.userId), 'Propriétaire du compte inattendu; suppression refusée.');
            fixture.userId = matches[0].id;
            await saveJournal();
        }
        return matches.length === 1;
    }
    try {
        if (cleanupFile) {
            fixture = JSON.parse(await readFile(journal, 'utf8'));
            ensure(fixture.base === base && /^smoke-auth-[a-f0-9-]{36}$/.test(fixture.username) && fixture.email === `${fixture.username}@example.invalid`
                && (!fixture.userId || /^[a-f0-9]{24}$/.test(fixture.userId)), 'Journal de nettoyage invalide.');
        }
        const ready = await request('health/ready', 200);
        ensure(ready.data?.status === 'ok' && ready.data.dependencies?.mongo === 'connected', 'Application non disponible.');
        report(`Cible : ${base}. Compte synthétique uniquement; aucun envoi SMTP.`);
        report('La connexion SUPERADMIN suit la politique normale de sessions du site.');
        const username = await prompt('Identifiant SUPERADMIN', {secret: true});
        adminPassword = await prompt('Mot de passe SUPERADMIN', {secret: true});
        let result = await request('auth/login', [200, 202], {method: 'POST', body: {username, password: adminPassword}, capture: true});
        if (result.status === 202) {
            ensure(result.data?.mfaEnrollmentRequired === false, 'MFA non configuré pour ce compte. Arrêt sans enrôlement.');
            const code = await prompt('Code MFA actuel', {secret: true});
            result = await request('auth/login/mfa', 200, {method: 'POST', body: {mfaChallenge: result.data.mfaChallenge, code}, capture: true});
        }
        admin = sessionFrom(result);
        ensure(result.data?.user?.role === 'SUPERADMIN', 'Un compte SUPERADMIN est requis.');
        await reauth();
        if (cleanupFile) { created = true; }
        else {
            await saveJournal();
            report(`Journal de secours : ${journal}`);
            const initial = password();
            created = true; // Includes a registration whose response gets lost.
            const registered = await request('auth/register', 201, {method: 'POST', session: admin,
                body: {username: fixture.username, email: fixture.email, password: initial, role: 'USER', mfaRequired: false}});
            ensure(registered.data?.user?.username === fixture.username && /^[a-f0-9]{24}$/.test(registered.data.user.id), 'Création inattendue.');
            fixture.userId = registered.data.user.id;
            await saveJournal();
            report('Compte temporaire créé.');
            const old = await loginTest(initial);
            await current(old, false);
            const replacement = password();
            await request(`auth/users/${fixture.userId}/reset-password`, 200, {method: 'POST', session: admin, body: {newPassword: replacement}});
            await revoked(old);
            const rejected = await request('auth/login', 401, {method: 'POST', body: {username: fixture.username, password: initial}});
            ensure(rejected.error?.code === 'INVALID_CREDENTIALS', 'Ancien mot de passe non refusé comme attendu.');
            const fresh = await loginTest(replacement);
            await current(fresh, false);
            await revoked(old);
            report('RESET_OK — anciens accès et renouvellements refusés, même après reconnexion.');
            const temporary = await request(`auth/users/${fixture.userId}/reset-password`, 200, {method: 'POST', session: admin, body: {}});
            ensure(typeof temporary.data?.temporaryPassword === 'string', 'Mot de passe temporaire absent.');
            await revoked(fresh);
            const pending = await loginTest(temporary.data.temporaryPassword);
            await current(pending, true);
            const finalPassword = password();
            await request('auth/complete-password-reset', 200, {method: 'POST', session: pending, body: {newPassword: finalPassword}});
            await revoked(pending);
            const final = await loginTest(finalPassword);
            await current(final, false);
            await revoked(pending);
            await revoked(old);
            const rotated = sessionFrom(await request('auth/refresh', 200, {method: 'POST', body: {}, session: {jar: final.jar}, capture: true}));
            await current(rotated, false);
            await request('auth/logout', 200, {method: 'POST', body: {}, session: rotated});
            await request('auth/session', 401, {session: rotated});
            report('FORCED_CHANGE_OK — changement obligatoire, reconnexion, renouvellement et déconnexion.');
        }
        success = true;
    } finally {
        if (created && admin) {
            try {
                await reauth(true);
                if (await lookup()) {
                    // Revoke every refresh family using the existing transactional reset.
                    await request(`auth/users/${fixture.userId}/reset-password`, 200, {method: 'POST', session: admin, body: {newPassword: password()}, cleaning: true});
                    // Disable before deletion: a partial cleanup leaves an inaccessible fixture.
                    await request(`auth/users/${fixture.userId}/status`, 200, {method: 'PATCH', session: admin, body: {isActive: false}, cleaning: true});
                    await request(`auth/users/${fixture.userId}`, 200, {method: 'DELETE', session: admin, cleaning: true});
                    ensure(!(await lookup()), 'Le compte temporaire existe encore.');
                }
                cleanupOK = !uncertain;
                if (cleanupOK) report('CLEANUP_OK — compte temporaire supprimé; audit conservé.');
            } catch { report('Nettoyage à reprendre avec le journal de secours.'); }
        }
        let logoutOK = true;
        if (admin) {
            try { await request('auth/logout', 200, {method: 'POST', body: {}, session: admin, cleaning: true}); }
            catch { logoutOK = false; report('Déconnexion SUPERADMIN non confirmée; fermer cette session depuis le compte.'); }
        }
        if (created && !cleanupOK) report(`NETTOYAGE_NON_CONFIRME : relancer après la fin des requêtes serveur : bash scripts/test-auth-admin-reset-production.sh --cleanup ${journal}`);
        // Delete all local credentials even on failure. Keep only the non-secret journal.
        for (const name of await readdir(work)) {
            if (path.join(work, name) !== journal || cleanupOK || !created) await rm(file(name), {force: true});
        }
        if (!created || cleanupOK) {
            if (cleanupFile && cleanupOK) await rm(journal, {force: true});
            await rm(work, {recursive: true, force: true});
        }
        process.off('SIGINT', signal);
        process.off('SIGTERM', signal);
        if (success) ensure((!created || cleanupOK) && logoutOK && !interrupted, 'Validation incomplète; consulter les indications de nettoyage.');
    }
    report(cleanupFile ? 'CLEANUP_COMPLETED' : 'AUTH_ADMIN_RESET_PASSED');
    return {username: fixture.username, userId: fixture.userId};
}

async function terminalPrompt(label) {
    process.stderr.write(`${label} : `);
    try {
        const {stdout} = await exec('bash', ['-c', 'IFS= read -r -s value </dev/tty || exit 1; printf "%s" "$value"'], {maxBuffer: 4096});
        process.stderr.write('\n');
        return stdout;
    } catch { throw new Error('Saisie interrompue; lancer depuis un terminal interactif.'); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const args = process.argv.slice(2);
    if (args.length && !(args.length === 2 && args[0] === '--cleanup')) {
        console.error('Usage: node scripts/auth-admin-reset-smoke.mjs [--cleanup chemin/cleanup.json]');
        process.exitCode = 2;
    } else {
        run({prompt: terminalPrompt, cleanupFile: args[1]}).catch(error => {
            console.error(`TEST_FAILED — ${error.message}`);
            process.exitCode = 1;
        });
    }
}
