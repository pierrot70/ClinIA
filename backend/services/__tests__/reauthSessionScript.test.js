import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const temporaryDirectories = [];
afterEach(() => { for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function run(target, input, scenario = "mfa") {
    const directory = mkdtempSync(path.join(tmpdir(), "clinia-script-fixture-"));
    temporaryDirectories.push(directory);
    const trace = path.join(directory, "trace");
    // Fake curl only: no network calls or application credentials in these tests.
    writeFileSync(path.join(directory, "curl"), `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2), url=args.at(-1), get=k=>args.includes(k)?args[args.indexOf(k)+1]:undefined;
const previous=fs.existsSync(process.env.FIXTURE_TRACE)?fs.readFileSync(process.env.FIXTURE_TRACE,'utf8'):'';
const out=get('--output'), header=args.filter((x,i)=>args[i-1]==='--header').find(x=>x.startsWith('@'));
const session=path.basename(out||'').startsWith('b.')?'b':'a';
const dataIndex=args.indexOf('--data-binary');
const fields=dataIndex<0?[]:Object.keys(JSON.parse(fs.readFileSync(args[dataIndex+1].slice(1),'utf8'))).sort();
fs.appendFileSync(process.env.FIXTURE_TRACE,JSON.stringify({url,firstArg:args[0],protocol:get('--proto'),fields,temporary:header?path.dirname(header.slice(1)):null})+'\\n');
let status=200, body={data:{accessToken:'synthetic-access',user:{role:'SUPERADMIN'}}};
if(url.endsWith('/health/ready')){
 body={data:{status:'ok',dependencies:{mongo:'connected'}},meta:{instanceId:process.env.FIXTURE_SCENARIO==='wrong-instance'?'wrong':url.includes(':4003/')?'mongo-rs-test-backend-replica':'mongo-rs-test-backend'}};
}else if(url.endsWith('/session')){
 const revoked=header.endsWith('/a.header')&&previous.includes(':4002/api/auth/logout');
 status=revoked&&process.env.FIXTURE_SCENARIO!=='logout-leak'?401:200;
 body=status===401?{error:{code:'UNAUTHORIZED'}}:{data:{user:{role:'SUPERADMIN'}}};
}else if(url.endsWith('/logout')&&url.includes(':4003/')&&process.env.FIXTURE_SCENARIO==='cleanup-failure'){
 status=500;body={error:{code:'TEST_FAILURE'}};
}else if(url.endsWith('/login')&&process.env.FIXTURE_SCENARIO!=='no-mfa'){
 status=202;body={data:{mfaRequired:true,mfaEnrollmentRequired:process.env.FIXTURE_SCENARIO==='enroll',mfaChallenge:'synthetic-challenge'}};
}else if(url.endsWith('/login/mfa')&&session==='b'&&process.env.FIXTURE_SCENARIO==='bad-mfa'){
 status=401;body={error:{code:'INVALID_MFA_CODE'}};
}else if(url.endsWith('/users/active')){
 const isB=header.endsWith('/b.header');
 const borrowedConfirmation=isB&&get('--cookie').endsWith('/a.cookies');
 status=isB&&!(borrowedConfirmation&&process.env.FIXTURE_SCENARIO==='vulnerable')?403:200;
 body=status===403?{error:{code:'REAUTH_REQUIRED'}}:{data:[]};
}
if(out&&out!=='/dev/null')fs.writeFileSync(out,JSON.stringify(body));
if(args.includes('--cookie-jar'))fs.writeFileSync(get('--cookie-jar'),'# synthetic cookie jar\\n');
process.stdout.write(String(status));
`, { mode: 0o700 });
    const result = spawnSync("bash", [path.join(root, "scripts/test-reauth-session-binding.sh"), ...target], {
        input, encoding: "utf8", timeout: 15000,
        env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, FIXTURE_TRACE: trace, FIXTURE_SCENARIO: scenario },
    });
    const calls = existsSync(trace) ? readFileSync(trace, "utf8").trim().split("\n").map(line => JSON.parse(line)) : [];
    const text = result.stdout + result.stderr;
    for (const secret of ["fixture-password", "123456", "654321", "synthetic-access", "synthetic-challenge"]) expect(text).not.toContain(secret);
    for (const call of calls) if (call.temporary) expect(existsSync(call.temporary)).toBe(false);
    return { ...result, calls, text };
}

describe("manual reauth script", () => {
    it("keeps local staging as the default without MFA", () => {
        const result = run([], "test-admin\nfixture-password\n", "no-mfa");
        expect(result.status).toBe(0);
        expect(result.text).toContain("PROTECTION CONFIRMEE");
        expect(result.calls.every(call => call.url.startsWith("http://localhost:4002/"))).toBe(true);
    });
    it("requires explicit remote approval before sending any request", () => {
        const result = run(["coolify"], "NON\n");
        expect(result.status).toBe(1);
        expect(result.calls).toHaveLength(0);
    });
    it("returns a failing exit code when another session accepts the borrowed confirmation", () => {
        const result = run([], "test-admin\nfixture-password\n123456\n654321\n", "vulnerable");
        expect(result.status).toBe(2);
        expect(result.text).toContain("FAILLE REPRODUITE");
        expect(result.text).not.toContain("PROTECTION CONFIRMEE");
        expect(result.calls.filter(call => call.url.endsWith("/logout"))).toHaveLength(2);
    });
    it("handles two MFA challenges and keeps HTTPS on Coolify", () => {
        const result = run(["coolify"], "TESTER COOLIFY\ntest-admin\nfixture-password\n123456\n654321\n");
        expect(result.status).toBe(0);
        expect(result.text).toContain("PROTECTION CONFIRMEE");
        const mfa = result.calls.filter(call => call.url.endsWith("/login/mfa"));
        expect(mfa).toHaveLength(2);
        expect(mfa.every(call => JSON.stringify(call.fields) === JSON.stringify(["code", "mfaChallenge"]))).toBe(true);
        expect(result.calls.every(call => call.firstArg === "-q" && call.protocol === "=https" && call.url.startsWith("https://clinique-ai.ca/"))).toBe(true);
        expect(result.calls.filter(call => call.url.endsWith("/logout"))).toHaveLength(2);
    });
    it("stops on invalid MFA and closes the session already created", () => {
        const result = run(["coolify"], "TESTER COOLIFY\ntest-admin\nfixture-password\n123456\n654321\n", "bad-mfa");
        expect(result.status).toBe(1);
        expect(result.text).not.toContain("PROTECTION CONFIRMEE");
        expect(result.calls.filter(call => call.url.endsWith("/logout"))).toHaveLength(1);
        expect(result.calls.filter(call => call.url.endsWith("/login/mfa"))).toHaveLength(2);
    });
    it("does not enroll MFA or expose its secret", () => {
        const result = run(["coolify"], "TESTER COOLIFY\ntest-admin\nfixture-password\n", "enroll");
        expect(result.status).toBe(1);
        expect(result.calls).toHaveLength(1);
    });
    it("validates reauth on the other instance and revocation after logout", () => {
        const result = run(["staging-pair"], "test-admin\nfixture-password\n123456\n654321\n");
        expect(result.status).toBe(0);
        expect(result.text).toContain("STAGING_PAIR_PASSED");
        expect(result.calls.filter(c => c.url.endsWith("/login")).map(c => c.url)).toEqual([
            "http://localhost:4002/api/auth/login", "http://localhost:4003/api/auth/login",
        ]);
        expect(result.calls.filter(c => c.url.endsWith("/users/active")).every(c => c.url.includes(":4003/"))).toBe(true);
        expect(result.calls.find(c => c.url.endsWith("/reauth")).url).toContain(":4002/");
        expect(result.calls.filter(c => c.url.endsWith("/logout"))).toHaveLength(2);
    });
    it.each([
        ["wrong-instance", 1], ["vulnerable", 2], ["logout-leak", 2], ["cleanup-failure", 1],
    ])("does not claim success for %s", (scenario, code) => {
        const result = run(["staging-pair"], "test-admin\nfixture-password\n123456\n654321\n", scenario);
        expect(result.status).toBe(code);
        expect(result.text).not.toContain("STAGING_PAIR_PASSED");
        if (scenario === "wrong-instance") expect(result.calls.every(c => c.url.endsWith("/health/ready"))).toBe(true);
    });
    it("refuses arbitrary destinations", () => {
        const result = run(["https://untrusted.invalid"], "");
        expect(result.status).toBe(1);
        expect(result.calls).toHaveLength(0);
    });
});
