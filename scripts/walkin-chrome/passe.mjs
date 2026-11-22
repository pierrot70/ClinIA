import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';

import { buildMatrix, scenarios } from './fixtures.mjs';

const statePath = new URL('./passe-en-cours.json', import.meta.url);
const tempPath = new URL('./passe-en-cours.tmp', import.meta.url);
const configPath = new URL('./cible.local', import.meta.url);
function writeState(state) {
    writeFileSync(tempPath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    renameSync(tempPath, statePath);
}

const remotePython = String.raw`
import re
import subprocess
names = subprocess.check_output([
    'docker', 'ps', '--filter', 'label=com.docker.compose.project=' + project,
    '--format', '{{.Names}}',
], text=True).splitlines()
backends = [n for n in names if re.fullmatch(r'backend-' + re.escape(project) + r'-[0-9T]+', n)]
if len(backends) != 1:
    raise SystemExit('Un seul conteneur backend ClinIA doit être actif.')
subprocess.run(['docker', 'exec', '-i', '-w', '/app', backends[0], 'node', '--input-type=module', '-'],
               input=source, text=True, check=True)
`;

function loadTarget() {
    const target = JSON.parse(readFileSync(configPath, 'utf8'));
    assert.match(target.ssh ?? '', /^[a-zA-Z0-9_][a-zA-Z0-9_@.-]*$/, 'Cible SSH invalide.');
    assert.match(target.project ?? '', /^[a-zA-Z0-9_-]+$/, 'Projet Docker Compose invalide.');
    assert.ok(Array.isArray(target.original) && target.original.length === 2, 'Deux affectations habituelles sont requises.');
    for (const id of [target.clinicId, target.userId, ...target.original]) {
        assert.match(id ?? '', /^[0-9a-f]{24}$/, 'Identifiant MongoDB invalide.');
    }
    assert.equal(new Set([target.clinicId, ...target.original]).size, 3, 'La clinique fictive doit être distincte.');
    return target;
}

function mongo(action, run, scenario = 1) {
    const template = readFileSync(new URL('./mongo-check.template.mjs', import.meta.url), 'utf8');
    const input = { fixtures: run.fixtures, state: run.mongo, index: scenario - 1, action,
        target: run.target, revision: run.revision };
    const source = template.replace('__WALKIN_INPUT__', JSON.stringify(input));
    return runInBackend(run.target, source);
}

function runInBackend(target, source) {
    const encode = value => JSON.stringify(Buffer.from(value, 'utf8').toString('base64'));
    const remote = 'import base64\nsource=base64.b64decode(' + encode(source) + ").decode('utf-8')\n" +
        'project=' + JSON.stringify(target.project) + '\n' + remotePython;
    const sshArgs = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
        '-o', 'ConnectTimeout=6', target.ssh, 'python3', '-u', '-'];
    const local = 'import base64, subprocess\nremote=base64.b64decode(' + encode(remote) + ").decode('utf-8')\n" +
        'subprocess.run(' + JSON.stringify(['ssh', ...sshArgs]) +
        ',input=remote,text=True,check=True,timeout=40)\n';
    const result = process.platform === 'win32'
        ? spawnSync('wsl.exe', ['-d', 'Ubuntu', '--', 'python3', '-u', '-'], {
            input: local, encoding: 'utf8', timeout: 50000,
        })
        : spawnSync('ssh', sshArgs, { input: remote, encoding: 'utf8', timeout: 50000 });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error('Le contrôle MongoDB a échoué.\n' + (result.stderr || '').trim());
    }
    return JSON.parse(result.stdout.trimEnd().split(/\r?\n/).at(-1));
}

function newRun() {
    const target = loadTarget();
    const { commit, source } = runInBackend(target, `
        import assert from 'node:assert/strict';
        import { readImageRevision } from './services/validationReports.js';
        assert.equal(process.env.NODE_ENV, 'production');
        console.log(JSON.stringify(await readImageRevision()));
    `);
    assert.equal(source, 'image-build', 'Version de l’image déployée inconnue.');
    return { fixtures: buildMatrix(randomInt(10000000, 99999988), commit), revision: commit, mongo: null, target };
}

function start() {
    const run = newRun();
    // Garde le plan sur disque avant d’ouvrir une session avec des écritures.
    writeFileSync(statePath, JSON.stringify(run, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    try {
        run.mongo = mongo('preflight', run);
    } catch (error) {
        unlinkSync(statePath);
        throw error;
    }
    writeState(run);
    run.mongo = mongo('prepare', run);
    writeState(run);
    console.log(JSON.stringify({ ready: true, total: 12 }));
}

function verify(run, arg) {
    assert.ok(run.mongo?.ready, 'La préparation des données fictives doit être terminée.');
    const scenario = Number(arg);
    assert.equal(scenario, run.mongo.saved.length + 1, 'Les scénarios se vérifient dans l’ordre.');
    assert.ok(scenario <= run.fixtures.length, 'La passe est déjà terminée.');
    const result = mongo('verify', run, scenario);
    run.mongo.saved.push(result);
    writeState(run);
    console.log(JSON.stringify({ scenario, patients: result.patients, inscriptions: result.newEntries,
        completed: run.mongo.saved.length === run.fixtures.length }));
}

function main([command, arg]) {
    if (command === 'liste') {
        console.log(JSON.stringify(scenarios.map(({ type, order }, index) => ({ scenario: index + 1, type, order })), null, 2));
        return;
    }
    if (command === 'preparer') {
        start();
        return;
    }
    if (command === 'controler') {
        const run = newRun();
        const { baseEntryIds } = mongo('preflight', run);
        console.log(JSON.stringify({ ready: true, existingTestEnrollments: baseEntryIds.length }));
        return;
    }
    if (!['scenario', 'verifier', 'nettoyer'].includes(command)) {
        throw new Error('Commandes disponibles : liste, controler, preparer, scenario N, verifier N, nettoyer.');
    }
    const run = JSON.parse(readFileSync(statePath, 'utf8'));
    if (command === 'scenario') {
        assert.ok(run.mongo?.ready, 'Préparation incomplète.');
        assert.equal(Number(arg), run.mongo.saved.length + 1, 'Le scénario précédent doit être vérifié.');
        const fixture = run.fixtures[Number(arg) - 1];
        assert.ok(fixture, 'Aucun autre scénario à lancer.');
        const { oldEmail, oldPhone, oldSms, ...browserFixture } = fixture;
        console.log(JSON.stringify(browserFixture));
    } else if (command === 'verifier') {
        verify(run, arg);
    } else {
        assert.ok(Array.isArray(run.mongo?.baseEntryIds), 'État initial MongoDB indisponible.');
        console.log(JSON.stringify(mongo('cleanup', run)));
        unlinkSync(statePath);
    }
}

try {
    main(process.argv.slice(2));
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
