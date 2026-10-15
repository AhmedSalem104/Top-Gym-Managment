'use strict';

// CI browser tests mock API responses and need only the real public documents
// and assets. Keeping this server data-free prevents the browser contract job
// from requiring a database or production secrets just to exercise UI flows.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');

const root = path.resolve(__dirname, '..', 'public');
const port = Number(process.env.PORT || 4173);

const contentTypes = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.svg', 'image/svg+xml'],
    ['.webp', 'image/webp'],
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.woff', 'font/woff'],
    ['.woff2', 'font/woff2'],
    ['.glb', 'model/gltf-binary']
]);

function sendJson(response, statusCode, payload) {
    const body = JSON.stringify(payload);
    response.writeHead(statusCode, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
    });
    response.end(body);
}

function resolvePublicFile(requestUrl) {
    const pathname = new URL(requestUrl, 'http://127.0.0.1').pathname;
    const routeFiles = new Map([
        ['/', 'index.html'],
        ['/login', 'login.html'],
        ['/login/', 'login.html'],
        ['/change-password', 'change-password.html'],
        ['/change-password/', 'change-password.html'],
        ['/member-portal', 'member-portal.html'],
        ['/member-portal/', 'member-portal.html'],
        ['/register-gym', 'register-gym.html'],
        ['/register-gym/', 'register-gym.html'],
        ['/register-trainer', 'register-trainer.html'],
        ['/register-trainer/', 'register-trainer.html'],
        ['/platform-admin', 'platform-admin.html'],
        ['/platform-admin/', 'platform-admin.html'],
        ['/platform-admin-forbidden', 'platform-admin-forbidden.html'],
        ['/platform-admin-forbidden/', 'platform-admin-forbidden.html'],
        ['/trainer-workspace', 'trainer-workspace.html'],
        ['/trainer-workspace/', 'trainer-workspace.html']
    ]);
    const relativePath = routeFiles.get(pathname)
        || (pathname.startsWith('/trainer-workspace/') ? 'trainer-workspace.html' : pathname.replace(/^\/+/, ''));
    const filePath = path.resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return null;
    return filePath;
}

const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/api/health' || pathname === '/api/health/live') {
        return sendJson(response, 200, { status: 'ok', browserQa: true });
    }
    // The standalone login requests these two read-only public endpoints at
    // boot. Keep the static visual harness self-contained and unauthenticated;
    // authenticated workflow tests provide their own route fixtures.
    if (request.method === 'GET' && pathname === '/api/auth/session') {
        return sendJson(response, 200, { authenticated: false, user: null });
    }
    if (request.method === 'GET' && pathname === '/api/branding') {
        return sendJson(response, 200, {});
    }
    if (request.method === 'GET' && pathname === '/api/phone/countries') {
        return sendJson(response, 200, { countries: [{ isoCode: 'EG', dialCode: '+20', country: 'Egypt' }] });
    }
    if (request.method === 'GET' && pathname === '/api/saas/entitlements') {
        return sendJson(response, 200, { tenantStatus: 'active', subscription: { status: 'active' }, entitlements: { features: {}, limits: {} } });
    }
    if (request.method === 'GET' && /^\/api\/public\/(gym|trainer)-registration\/catalog$/.test(pathname)) {
        return sendJson(response, 200, { plans: [], paymentMethods: [] });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        return response.end();
    }

    const filePath = resolvePublicFile(request.url);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return response.end('Not found');
    }
    const extension = path.extname(filePath).toLowerCase();
    const headers = {
        'Cache-Control': 'no-store',
        'Content-Type': contentTypes.get(extension) || 'application/octet-stream'
    };
    if (request.method === 'HEAD') {
        response.writeHead(200, headers);
        return response.end();
    }
    response.writeHead(200, headers);
    return fs.createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`Browser QA server listening on http://127.0.0.1:${port}\n`);
});

function shutdown() {
    server.close(() => process.exit(0));
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
