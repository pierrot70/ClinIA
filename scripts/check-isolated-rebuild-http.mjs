// Runs in the isolated backend container after both rebuilt services start.
// Checks readiness, frontend assets and the local frontend-to-backend proxy.
import fs from 'node:fs';
const resultFile = '/tmp/clinia-rebuild-http.json';
try {
    const checks = [];
    for (const base of ['http://127.0.0.1:4000', 'http://127.0.0.1:8080']) {
        const response = await fetch(base + '/api/health/ready', { signal: AbortSignal.timeout(5000) });
        const body = await response.json();
        if (response.status !== 200 || body.data?.dependencies?.mongo !== 'connected') throw new Error('not_ready');
        checks.push({ endpoint: base + '/api/health/ready', http: 200, mongo: 'connected' });
    }
    const response = await fetch('http://127.0.0.1:8080/', { signal: AbortSignal.timeout(5000) });
    const html = await response.text();
    if (response.status !== 200 || !html.includes('id="root"')) throw new Error('frontend_unavailable');
    const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)].map(match => match[1]))];
    if (!assets.length) throw new Error('frontend_assets_missing');
    for (const asset of assets) {
        const response = await fetch('http://127.0.0.1:8080' + asset, { signal: AbortSignal.timeout(5000) });
        if (response.status !== 200) throw new Error('frontend_asset_unavailable');
        await response.arrayBuffer();
    }
    fs.writeFileSync(resultFile, JSON.stringify({ status: 'OK', checks, frontendHttp: 200, assetsChecked: assets.length }));
} catch (_) {
    fs.writeFileSync(resultFile, JSON.stringify({ status: 'ERROR', detailsSuppressed: true }));
    process.exitCode = 1;
}
