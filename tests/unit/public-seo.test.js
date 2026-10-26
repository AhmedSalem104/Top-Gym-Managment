'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const publicDir = path.join(__dirname, '..', '..', 'public');
const read = (name) => fs.readFileSync(path.join(publicDir, name), 'utf8');

test('public acquisition pages have canonical metadata while private auth pages remain excluded', () => {
    const expected = [
        ['index.html', 'https://getlogicfit.com/'],
        ['register-gym.html', 'https://getlogicfit.com/register-gym'],
        ['register-trainer.html', 'https://getlogicfit.com/register-trainer']
    ];
    for (const [file, canonical] of expected) {
        const html = read(file);
        assert.match(html, /<meta name="description" content="[^"]+">/u, file);
        assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`), file);
        assert.doesNotMatch(html, /<meta name="robots" content="noindex,nofollow">/u, file);
    }
    for (const file of ['change-password.html', 'member-portal.html', 'platform-admin.html', 'trainer-workspace.html']) {
        assert.match(read(file), /<meta name="robots" content="noindex,nofollow">/u, file);
    }
});

test('robots and sitemap are crawler-readable static documents with only public URLs', () => {
    const robots = read('robots.txt');
    const sitemap = read('sitemap.xml');
    assert.match(robots, /^User-agent: \*/u);
    assert.match(robots, /Disallow: \/api\//u);
    assert.match(robots, /Sitemap: https:\/\/getlogicfit\.com\/sitemap\.xml/u);
    assert.match(sitemap, /^<\?xml/u);
    assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]), [
        'https://getlogicfit.com/',
        'https://getlogicfit.com/register-gym',
        'https://getlogicfit.com/register-trainer'
    ]);
    assert.doesNotMatch(sitemap, /\/api\/|member-portal|platform-admin|trainer-workspace|change-password/u);
});
