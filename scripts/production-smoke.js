'use strict';

function parseBaseUrl(argv = process.argv.slice(2)) {
    const index = argv.indexOf('--base-url');
    return String(index >= 0 ? argv[index + 1] || '' : process.env.SMOKE_BASE_URL || '').replace(/\/$/, '');
}

async function check(baseUrl, pathname, expectedStatuses) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
        const response = await fetch(`${baseUrl}${pathname}`, { redirect: 'manual', signal: controller.signal });
        const ok = expectedStatuses.includes(response.status);
        return { path: pathname, status: response.status, ok };
    } finally {
        clearTimeout(timer);
    }
}

function extractAssetPaths(html) {
    const paths = new Set();
    const source = String(html || '');
    const pattern = /(?:src|href)\s*=\s*["'](\/[^"']+)["']/gi;
    for (const match of source.matchAll(pattern)) {
        const pathname = String(match[1] || '').split(/[?#]/, 1)[0];
        if (/\.(?:css|js|mjs|svg|png|webp|jpe?g|gif|ico|woff2?|ttf|glb)$/i.test(pathname)) paths.add(String(match[1]));
    }
    return [...paths].slice(0, 40);
}

async function checkHomepageAndAssets(baseUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
        const response = await fetch(`${baseUrl}/`, { redirect: 'manual', signal: controller.signal });
        const body = response.status === 200 ? await response.text() : '';
        const assetPaths = extractAssetPaths(body);
        const assets = await Promise.all(assetPaths.map((pathname) => check(baseUrl, pathname, [200])));
        return {
            path: '/',
            status: response.status,
            ok: response.status === 200 && assets.every((asset) => asset.ok),
            assetCount: assets.length,
            failedAssets: assets.filter((asset) => !asset.ok).map((asset) => ({ path: asset.path, status: asset.status }))
        };
    } finally {
        clearTimeout(timer);
    }
}

async function runSmoke(baseUrl) {
    if (!/^https?:\/\//i.test(baseUrl)) throw new Error('A smoke-test base URL is required.');
    const checks = [
        checkHomepageAndAssets(baseUrl),
        check(baseUrl, '/api/health/live', [200]),
        check(baseUrl, '/api/health', [200]),
        check(baseUrl, '/api/public/gym-registration/catalog', [200]),
        check(baseUrl, '/api/public/trainer-registration/catalog', [200]),
        check(baseUrl, '/api/notifications/unread-count', [401, 403])
    ];
    const results = await Promise.all(checks);
    if (results.some((result) => !result.ok)) {
        const error = new Error('Production smoke check failed.');
        error.code = 'PRODUCTION_SMOKE_FAILED';
        error.results = results;
        throw error;
    }
    return { status: 'PASS', checks: results };
}

if (require.main === module) {
    runSmoke(parseBaseUrl())
        .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
        .catch((error) => {
            process.stderr.write(`${JSON.stringify({ status: 'FAIL', code: error.code || 'PRODUCTION_SMOKE_FAILED', checks: error.results || [] })}\n`);
            process.exitCode = 1;
        });
}

module.exports = { check, checkHomepageAndAssets, extractAssetPaths, parseBaseUrl, runSmoke };
