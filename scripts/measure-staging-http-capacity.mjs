// Fixed local staging target. No credentials, writes, redirects or patient data.
import http from 'node:http';
import os from 'node:os';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const target = 'http://127.0.0.1:4002/api/health/ready';
if (process.argv[2] !== '--run') throw new Error('Explicit local run required: node scripts/measure-staging-http-capacity.mjs --run');
const agent = new http.Agent({ keepAlive: true, maxSockets: 128 });
const report = { startedAt: new Date().toISOString(), target, workload: 'readiness HTTP only; no database queries', cpus: os.cpus().length, phases: [] };
let stop = false, reason = '', active = 0;
process.on('SIGINT', () => { stop = true; reason = 'operator interrupt'; });
process.on('SIGTERM', () => { stop = true; reason = 'operator termination'; });
function request() {
    return new Promise(resolve => {
        const start = performance.now();
        let done = false;
        const finish = status => { if (!done) { done = true; resolve({ status, ms: performance.now() - start }); } };
        const req = http.get(target, { agent }, res => { res.resume(); res.on('end', () => finish(res.statusCode)); res.on('error', () => finish(0)); });
        const timer = setTimeout(() => req.destroy(), 2000);
        req.on('close', () => clearTimeout(timer));
        req.on('error', () => finish(0));
    });
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function cpu() { const values = os.cpus().map(c => c.times); return { idle: values.reduce((s,v)=>s+v.idle,0), total: values.reduce((s,v)=>s+Object.values(v).reduce((a,b)=>a+b,0),0) }; }
async function sample() {
    const memory = await readFile('/proc/meminfo', 'utf8');
    const availableMiB = Number(memory.match(/^MemAvailable:\s+(\d+)/m)?.[1]) / 1024;
    const { stdout } = await exec('docker', ['stats', '--no-stream', '--format', '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}'], { timeout: 5000, maxBuffer: 65536 });
    return { availableMiB: Math.round(availableMiB), containers: stdout.trim().split('\n').filter(line => line.startsWith('clinia_mongo_rs-')) };
}
try {
    const baseline = await request();
    if (baseline.status !== 200) throw new Error('Local staging readiness failed');
    report.baseline = { ...baseline, ...await sample() };
    console.log(JSON.stringify({ baseline: report.baseline }));
    for (const rate of [25, 100, 250, 500, 1000, 1500, 2000]) {
        if (stop) break;
        const results = [], pending = new Set(), samples = [];
        let sent = 0, skipped = 0, oldCpu = cpu(), sampling = false;
        const started = performance.now();
        const monitor = setInterval(async () => {
            if (sampling) return;
            sampling = true;
            try {
                const stats = await sample(), nextCpu = cpu();
                stats.hostCpuPercent = Math.round(100 * (1 - (nextCpu.idle-oldCpu.idle)/(nextCpu.total-oldCpu.total)));
                oldCpu = nextCpu; samples.push(stats);
                if (stats.availableMiB < 2048 || stats.hostCpuPercent > 85) { stop = true; reason = 'host resource safety threshold'; }
            } catch { stop = true; reason = 'resource monitoring unavailable'; }
            finally { sampling = false; }
        }, 2000);
        while (!stop && performance.now() - started < 10000) {
            // Open-loop schedule, no catch-up burst after generator delay.
            const due = Math.floor((performance.now() - started) * rate / 1000);
            const count = Math.min(128 - active, Math.max(0, due - sent));
            skipped += Math.max(0, due - sent - count); sent = due;
            for (let n = 0; n < count; n++) {
                active++;
                const p = request().then(result => { results.push(result); if (result.status !== 200 || result.ms > 1000) { stop = true; reason = 'HTTP error or request latency above 1 second'; } }).finally(() => { active--; pending.delete(p); });
                pending.add(p);
            }
            await sleep(10);
        }
        clearInterval(monitor);
        await Promise.all(pending);
        while (sampling) await sleep(50);
        const seconds = (performance.now() - started) / 1000;
        const latencies = results.map(r=>r.ms).sort((a,b)=>a-b);
        const quantile = q => Math.round(latencies[Math.min(latencies.length-1, Math.floor(latencies.length*q))] || 0);
        const phase = { targetRps: rate, actualRps: Math.round(results.length/seconds), seconds: +seconds.toFixed(2), requests: results.length, skipped, errors: results.filter(r=>r.status!==200).length, p50Ms: quantile(.5), p95Ms: quantile(.95), p99Ms: quantile(.99), samples };
        report.phases.push(phase);
        console.log(JSON.stringify({ ...phase, samples: undefined }));
        if (phase.p95Ms > 500 || skipped > sent * .05) { stop = true; reason ||= 'latency or load-generator/concurrency limit'; }
        await sleep(2000);
    }
    report.stopReason = reason || 'configured ceiling reached, saturation not demonstrated';
    report.recovery = await request();
} catch (error) { report.stopReason = 'preflight or measurement error'; process.exitCode = 1; console.error('Measurement stopped; no raw error retained.'); }
finally {
    agent.destroy();
    report.finishedAt = new Date().toISOString();
    const output = `/tmp/clinia-http-capacity-${Date.now()}.json`;
    await writeFile(output, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ stopReason: report.stopReason, recovery: report.recovery, report: output }));
}
