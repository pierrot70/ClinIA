import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const directories = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function run(scenario = "protected", target = [], input = "test-user\nfixture-password\n123456\n654321\n", expected = {}) {
    const directory = mkdtempSync(path.join(tmpdir(), "clinia-mfa-script-fixture-"));
    directories.push(directory);
    const trace = path.join(directory, "trace");
    writeFileSync(path.join(directory, "curl"), `#!${process.execPath}
const fs=require('node:fs'), path=require('node:path');
async function main(){
const args=process.argv.slice(2), url=args.at(-1), get=k=>args.includes(k)?args[args.indexOf(k)+1]:undefined;
const out=get('--output'), scenario=process.env.FIXTURE_SCENARIO;
const session=path.basename(out).startsWith('b.')?'b':'a';
const concurrent=process.env.FIXTURE_CONCURRENT==='true';
const calls=fs.existsSync(process.env.FIXTURE_TRACE)?fs.readFileSync(process.env.FIXTURE_TRACE,'utf8').trim().split('\\n').map(JSON.parse):[];
const number=calls.filter(c=>c.url.endsWith('/login/mfa')).length;
const payload=args.includes('--data-binary')?JSON.parse(fs.readFileSync(get('--data-binary').slice(1),'utf8')):{};
let status=200, body={data:{accessToken:'synthetic-access',user:{role:'SUPERADMIN'}}};
if(url.endsWith('/health/ready')){
 body={data:{status:'ok',dependencies:{mongo:'connected'}},meta:{instanceId:scenario==='wrong-instance'?'wrong':url.includes(':4102/')?'instance-test-a':url.includes(':4103/')?(scenario==='same-instance'?'instance-test-a':scenario==='changed-instance'&&number>0?'instance-changed':'instance-test-b'):url.includes(':4003/')?'mongo-rs-test-backend-replica':'mongo-rs-test-backend'}};
}else if(url.endsWith('/logout')&&scenario==='cleanup-failure'){
 status=500;body={error:{code:'TEST_FAILURE'}};
}else if(url.endsWith('/login')&&scenario!=='no-mfa'){
 status=202;body={data:{mfaRequired:true,mfaEnrollmentRequired:scenario==='enroll',mfaChallenge:'synthetic-challenge-'+session.repeat(40)}};
}else if(url.endsWith('/login/mfa')){
 if(!concurrent&&number===1&&scenario!=='vulnerable'){status=scenario==='rate-limit'?429:401;body={error:{code:scenario==='rate-limit'?'RATE_LIMITED':'INVALID_MFA_CODE'}};}
 if(!concurrent&&((number===0&&scenario==='bad-first')||(number===2&&scenario==='bad-next'))){status=401;body={error:{code:'INVALID_MFA_CODE'}};}
 if(concurrent){
  if(payload.code==='123456'){
   fs.writeFileSync(process.env.FIXTURE_TRACE+'.arrived-'+session,'');
   const other=process.env.FIXTURE_TRACE+'.arrived-'+(session==='a'?'b':'a');
   const deadline=Date.now()+2000;
   while(!fs.existsSync(other)){if(Date.now()>deadline)process.exit(8);await new Promise(r=>setTimeout(r,10));}
   await new Promise(r=>setTimeout(r,40));
   if(scenario==='network'&&session==='b')process.exit(7);
   const winner=scenario==='b-wins'?'b':'a';
   if(scenario==='both-refused'||(session!==winner&&scenario!=='vulnerable')){
    status=scenario==='rate-limit'?429:401;body={error:{code:scenario==='wrong-error'?'INVALID_CHALLENGE':scenario==='rate-limit'?'RATE_LIMITED':scenario==='invalid-code'?'INVALID_MFA_CODE':'INVALID_MFA_CHALLENGE'}};
   }
  }else if(scenario==='bad-next'){status=401;body={error:{code:'INVALID_MFA_CODE'}};}
 }
}
const header=args.filter((x,i)=>args[i-1]==='--header').find(x=>x.startsWith('@'));
fs.appendFileSync(process.env.FIXTURE_TRACE,JSON.stringify({url,args:args.filter(x=>!x.startsWith('@')),temporary:out!=='/dev/null'?path.dirname(out):null,session,firstCode:payload.code==='123456',nextCode:payload.code==='654321',challenge:payload.mfaChallenge?.endsWith((concurrent&&payload.code==='123456'?'a':session).repeat(40))})+'\\n');
if(out!=='/dev/null')fs.writeFileSync(out,JSON.stringify(body));
if(args.includes('--cookie-jar'))fs.writeFileSync(get('--cookie-jar'),'# synthetic cookies\\n');
if(args.includes('--dump-header')){
 const time=(scenario==='expired'&&(concurrent?session==='b':number===1))?'Sun, 13 Sep 2026 12:00:45 GMT':'Sun, 13 Sep 2026 12:00:15 GMT';
 fs.writeFileSync(get('--dump-header'),scenario==='no-date'?'HTTP/1.1 200 OK\\r\\n':'HTTP/1.1 200 OK\\r\\nDate: '+time+'\\r\\n');
}
process.stdout.write(String(status));
}
main().catch(()=>process.exit(9));
`, { mode: 0o700 });
    const result = spawnSync("bash", [path.join(root, "scripts/test-mfa-replay.sh"), ...target], {
        input, encoding: "utf8", timeout: 15000,
        env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, FIXTURE_TRACE: trace, FIXTURE_SCENARIO: scenario, FIXTURE_CONCURRENT: String(target.includes("--concurrent")), CLINIA_EXPECTED_INSTANCE_A: "", CLINIA_EXPECTED_INSTANCE_B: "", ...expected },
    });
    const calls = existsSync(trace) ? readFileSync(trace, "utf8").trim().split("\n").map(JSON.parse) : [];
    const text = result.stdout + result.stderr;
    for (const secret of ["fixture-password", "123456", "654321", "synthetic-access", "synthetic-challenge"]) expect(text).not.toContain(secret);
    for (const call of calls) if (call.temporary) expect(existsSync(call.temporary)).toBe(false);
    return { ...result, calls, text };
}

describe("manual MFA replay script (simulated HTTP only)", () => {
    it("reuses the first code on a new challenge, then uses a different code on B", () => {
        const result = run();
        expect(result.status).toBe(0);
        expect(result.text).toContain("PROTECTION CONFIRMEE");
        const mfa = result.calls.filter(c => c.url.endsWith('/login/mfa'));
        expect(mfa.map(c => [c.session, c.firstCode, c.nextCode, c.challenge])).toEqual([
            ['a', true, false, true], ['b', true, false, true], ['b', false, true, true],
        ]);
        expect(result.calls.filter(c => c.url.endsWith('/logout'))).toHaveLength(2);
        expect(result.calls.every(c => c.url.startsWith('http://localhost:4002/'))).toBe(true);
    });
    it("reports a vulnerable backend and closes both sessions", () => {
        const result = run('vulnerable');
        expect(result.status).toBe(2);
        expect(result.text).toContain('FAILLE REPRODUITE');
        expect(result.calls.filter(c => c.url.endsWith('/logout'))).toHaveLength(2);
    });
    it.each(['expired', 'no-date', 'rate-limit', 'bad-first', 'bad-next', 'no-mfa', 'enroll'])("does not certify protection for %s", scenario => {
        const result = run(scenario);
        expect(result.status).toBe(1);
        expect(result.text).not.toContain('PROTECTION CONFIRMEE');
        if (scenario === 'no-mfa') expect(result.calls.filter(c => c.url.endsWith('/logout'))).toHaveLength(1);
        if (scenario === 'enroll') expect(result.calls).toHaveLength(1);
    });
    it("requires approval before remote requests", () => {
        const result = run('protected', ['coolify'], 'NON\n');
        expect(result.status).toBe(1);
        expect(result.calls).toHaveLength(0);
    });
    it("uses verified HTTPS without redirects for Coolify", () => {
        const result = run('protected', ['coolify'], 'TESTER COOLIFY\ntest-user\nfixture-password\n123456\n654321\n');
        expect(result.status).toBe(0);
        for (const call of result.calls) {
            expect(call.url.startsWith('https://clinique-ai.ca/')).toBe(true);
            expect(call.args[0]).toBe('-q');
            expect(call.args[call.args.indexOf('--proto') + 1]).toBe('=https');
            expect(call.args).not.toContain('--insecure');
            expect(call.args).not.toContain('--location');
        }
    });
    it("rejects replay on the other staging instance and cleans up both sessions", () => {
        const result = run('protected', ['staging-pair']);
        expect(result.status).toBe(0);
        expect(result.text).toContain('STAGING_MFA_PAIR_PASSED');
        expect(result.calls.filter(c => c.url.endsWith('/login/mfa')).map(c => c.url)).toEqual([
            'http://localhost:4002/api/auth/login/mfa',
            'http://localhost:4003/api/auth/login/mfa',
            'http://localhost:4003/api/auth/login/mfa',
        ]);
        expect(result.calls.filter(c => c.url.endsWith('/logout')).map(c => c.url)).toEqual([
            'http://localhost:4002/api/auth/logout', 'http://localhost:4003/api/auth/logout',
        ]);
    });
    it.each(['expired', 'no-date', 'wrong-instance', 'cleanup-failure', 'bad-next', 'vulnerable'])("does not certify cross-instance protection for %s", scenario => {
        const result = run(scenario, ['staging-pair']);
        expect(result.status).toBe(scenario === 'vulnerable' ? 2 : 1);
        expect(result.text).not.toContain('STAGING_MFA_PAIR_PASSED');
        expect(result.text).not.toContain('PROTECTION CONFIRMEE');
        if (scenario === 'wrong-instance') expect(result.calls.every(c => c.url.endsWith('/health/ready'))).toBe(true);
    });
    it.each(['protected', 'b-wins', 'invalid-code'])("runs overlapping MFA requests and validates a fresh challenge afterwards (%s)", scenario => {
        const result = run(scenario, ['coolify', '--concurrent'], 'TESTER COOLIFY\ntest-user\nfixture-password\n123456\n654321\n');
        expect(result.status).toBe(0);
        expect(result.text).toContain('MFA_CONCURRENT_PASSED');
        const calls = result.calls.filter(c => c.url.endsWith('/login/mfa'));
        expect(calls).toHaveLength(3);
        expect(result.calls.slice(0, 3).map(c => c.url.split('/').at(-1))).toEqual(['login', 'mfa', 'mfa']);
        expect(result.calls.filter(c => c.url.endsWith('/login'))).toHaveLength(2);
        expect(calls.slice(0, 2).every(c => c.firstCode && c.challenge)).toBe(true);
        expect(new Set(calls.slice(0, 2).map(c => c.session)).size).toBe(2);
        expect(calls[2].session).toBe(scenario === 'b-wins' ? 'a' : 'b');
        expect(calls[2].nextCode && calls[2].challenge).toBe(true);
        expect(result.calls.filter(c => c.url.endsWith('/logout'))).toHaveLength(2);
        expect(result.calls.every(c => c.url.startsWith('https://clinique-ai.ca/'))).toBe(true);
    });
    it.each(['vulnerable', 'both-refused', 'wrong-error', 'expired', 'no-date', 'rate-limit', 'bad-next', 'cleanup-failure', 'network'])("does not certify parallel MFA for %s", scenario => {
        const result = run(scenario, ['staging-pair', '--concurrent']);
        expect(result.status).toBe(scenario === 'vulnerable' ? 2 : 1);
        expect(result.text).not.toContain('MFA_CONCURRENT_PASSED');
        if (scenario === 'vulnerable') expect(result.calls.filter(c => c.url.endsWith('/logout'))).toHaveLength(2);
        if (scenario === 'network') expect(result.calls.filter(c => c.url.endsWith('/logout'))).toHaveLength(1);
    });
    it("requires approval in concurrent Coolify mode", () => {
        const result = run('protected', ['coolify', '--concurrent'], 'NON\n');
        expect(result.status).toBe(1);
        expect(result.calls).toHaveLength(0);
    });
    const pairIds = { CLINIA_EXPECTED_INSTANCE_A: 'instance-test-a', CLINIA_EXPECTED_INSTANCE_B: 'instance-test-b' };
    const pairInput = 'TESTER COOLIFY\ntest-user\nfixture-password\n123456\n654321\n';
    it("targets distinct pinned tunnel instances and checks their identities again afterwards", () => {
        const result = run('protected', ['coolify-pair', '--concurrent'], pairInput, pairIds);
        expect(result.status).toBe(0);
        expect(result.text).toContain('COOLIFY_MFA_PAIR_PASSED');
        const mfa = result.calls.filter(c => c.url.endsWith('/login/mfa'));
        expect(new Set(mfa.slice(0, 2).map(c => c.url))).toEqual(new Set([
            'http://localhost:4102/api/auth/login/mfa', 'http://localhost:4103/api/auth/login/mfa',
        ]));
        expect(mfa.slice(0, 2).every(c => c.challenge && c.firstCode)).toBe(true);
        expect(result.calls.filter(c => c.url.endsWith('/health/ready'))).toHaveLength(4);
    });
    it.each(['wrong-instance', 'same-instance', 'changed-instance', 'cleanup-failure'])("rejects tunnel result for %s", scenario => {
        const result = run(scenario, ['coolify-pair', '--concurrent'], pairInput, pairIds);
        expect(result.status).toBe(1);
        expect(result.text).not.toContain('COOLIFY_MFA_PAIR_PASSED');
        if (['wrong-instance', 'same-instance'].includes(scenario)) expect(result.calls.every(c => c.url.endsWith('/health/ready'))).toBe(true);
    });
    it.each([{}, { ...pairIds, CLINIA_EXPECTED_INSTANCE_B: 'instance-test-a' }])("rejects missing or duplicate pinned identities", expected => {
        const result = run('protected', ['coolify-pair', '--concurrent'], pairInput, expected);
        expect(result.status).toBe(1);
        expect(result.calls).toHaveLength(0);
    });
    it("requires explicit approval before tunnel requests", () => {
        const result = run('protected', ['coolify-pair', '--concurrent'], 'NON\n', pairIds);
        expect(result.status).toBe(1);
        expect(result.calls).toHaveLength(0);
    });
    it("refuses arbitrary destinations", () => {
        const result = run('protected', ['https://untrusted.invalid']);
        expect(result.status).toBe(1);
        expect(result.calls).toHaveLength(0);
    });
    it("refuses a repeated code for the positive control", () => {
        const result = run('protected', [], 'test-user\nfixture-password\n123456\n123456\n');
        expect(result.status).toBe(1);
        expect(result.text).not.toContain('PROTECTION CONFIRMEE');
        expect(result.calls.filter(c => c.url.endsWith('/login/mfa'))).toHaveLength(2);
    });
});
