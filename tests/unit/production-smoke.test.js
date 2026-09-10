'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractAssetPaths } = require('../../scripts/production-smoke');

test('production smoke extracts bounded same-origin static assets only', () => {
    const paths = extractAssetPaths(`
        <link rel="stylesheet" href="/css/main.css?v=1">
        <link rel="icon" href="/favicon.svg">
        <script src="/js/app.js?v=2"></script>
        <script src="https://cdn.example.invalid/app.js"></script>
        <a href="/login">login</a>
    `);
    assert.deepEqual(paths, ['/css/main.css?v=1', '/favicon.svg', '/js/app.js?v=2']);
});

test('production smoke limits asset discovery to a bounded set', () => {
    const html = Array.from({ length: 100 }, (_, index) => `<script src="/js/chunk-${index}.js"></script>`).join('');
    assert.equal(extractAssetPaths(html).length, 40);
});
