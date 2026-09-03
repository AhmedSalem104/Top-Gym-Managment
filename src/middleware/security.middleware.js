'use strict';

const path = require('node:path');
const compression = require('compression');
const express = require('express');
const { requestIdMiddleware } = require('./request-id.middleware');

function securityHeaders(request, response, next) {
    response.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(self), microphone=()'
    });
    // Emit HSTS only after Express has positively identified an HTTPS request
    // (including a trusted reverse-proxy signal). Local HTTP development must
    // not pin a browser to HTTPS accidentally.
    if (request.secure === true) {
        response.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
}

function noStoreApi(request, response, next) {
    response.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
}

function staticHeaders(response, filePath) {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.html') {
        response.setHeader('Cache-Control', 'no-cache, must-revalidate');
        return;
    }
    if (/\.(?:css|js|mjs|svg|webp|png|jpg|jpeg|woff2?)$/i.test(filePath)) {
        const versioned = String(response.req?.url || '').includes('?v=');
        response.setHeader('Cache-Control', versioned
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=86400, stale-while-revalidate=604800');
    }
}

function createBaseApp({ publicDirectory, expressFactory = express, trustProxyHops = 0 }) {
    const app = expressFactory();
    app.disable('x-powered-by');
    app.set('trust proxy', Number.isInteger(trustProxyHops) ? Math.max(0, Math.min(3, trustProxyHops)) : 0);
    app.use(requestIdMiddleware);
    app.use(express.json({ limit: '1mb' }));
    app.use(securityHeaders);
    app.use(compression({ threshold: 1024 }));
    // Keep the root route under the server's control. Express static serves
    // index.html automatically for `/` by default, which would bypass the
    // authenticated workspace resolver and briefly expose the Gym shell to a
    // forced-password session. Explicit routes still serve static assets and
    // pages, while `/` falls through to server.js for auth-aware routing.
    app.use(express.static(publicDirectory, { index: false, etag: true, lastModified: true, setHeaders: staticHeaders }));
    app.use('/api', noStoreApi);
    return app;
}

module.exports = { createBaseApp, noStoreApi, securityHeaders, staticHeaders };
