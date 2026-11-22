import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildMatrix } from './walkin-chrome/fixtures.mjs';

test('le pilote présente les 12 scénarios dans l’ordre et distingue les passes sur la même version', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'clinia-walkin-cli-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    for (const file of ['passe.mjs', 'fixtures.mjs']) {
        await copyFile(new URL('./walkin-chrome/' + file, import.meta.url), join(dir, file));
    }
    const run = (...args) => JSON.parse(execFileSync(process.execPath, ['passe.mjs', ...args], { cwd: dir }));
    const revision = '01abcd23'.repeat(5);
    const fixtures = buildMatrix(21000000, revision);
    const other = buildMatrix(22000000, revision);
    const names = ['patient', 'walkin'].flatMap(type => Array.from('ABCDEF', letter => type + '_' + letter + '_01abcd23'));
    assert.deepEqual(fixtures.map(f => f.last), names);
    assert.deepEqual(other.map(f => f.last), names);
    assert.equal(new Set([...fixtures, ...other].map(f => f.insurance)).size, 24);
    const matrix = run('liste');
    assert.deepEqual(matrix, fixtures.map(({ scenario, type, order }) => ({ scenario, type, order })));
    for (const type of ['existant', 'nouveau']) {
        const orders = matrix.filter(row => row.type === type).map(row => row.order);
        assert.equal(new Set(orders.map(order => order.join('/'))).size, 6);
        for (const order of orders) assert.deepEqual([...order].sort(), ['SMS', 'appel', 'courriel']);
    }
    const mongo = { ready: true, saved: [] };
    for (const fixture of fixtures) {
        await writeFile(join(dir, 'passe-en-cours.json'), JSON.stringify({ revision, fixtures, mongo }));
        const { oldEmail, oldPhone, oldSms, ...expected } = fixture;
        assert.deepEqual(run('scenario', String(fixture.scenario)), expected);
        mongo.saved.push({ scenario: fixture.scenario });
    }
    assert.notEqual(spawnSync(process.execPath, ['passe.mjs', 'scenario', '1'], { cwd: dir }).status, 0);
});
