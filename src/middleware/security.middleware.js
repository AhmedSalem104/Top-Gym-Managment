'use strict';

const path = require('node:path');
const compression = require('compression');
const express = require('express');

function securityHeaders(request, response, next) {
    response.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(self), microphone=()'
    });
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

function createBaseApp({ publicDirectory }) {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '1mb' }));
    app.use(securityHeaders);
    app.use(compression({ threshold: 1024 }));
    app.use(express.static(publicDirectory, { etag: true, lastModified: true, setHeaders: staticHeaders }));
    app.use('/api', noStoreApi);
    return app;
}

module.exports = { createBaseApp, noStoreApi, securityHeaders, staticHeaders };
