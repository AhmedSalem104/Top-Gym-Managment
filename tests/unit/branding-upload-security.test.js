'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { isSafeSvgMarkup, validateAsset } = require('../../src/services/branding-service');

test('branding SVG validation allows static internal markup', () => {
    const svg = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" /></defs><path fill="url(#g)" d="M1 1h22v22H1z" /></svg>';
    assert.equal(isSafeSvgMarkup(svg), true);
    const result = validateAsset({
        key: 'primaryLogo',
        mimeType: 'image/svg+xml',
        fileName: 'logo.svg',
        buffer: Buffer.from(svg)
    });
    assert.deepEqual({ width: result.width, height: result.height }, { width: 24, height: 24 });
});

test('branding SVG validation rejects active, external and entity content', () => {
    const unsafe = [
        '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>',
        '<svg viewBox="0 0 1 1"><foreignObject><div>bad</div></foreignObject></svg>',
        '<svg viewBox="0 0 1 1"><image href="https://example.com/a.png" /></svg>',
        '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg viewBox="0 0 1 1" />'
    ];
    for (const source of unsafe) {
        assert.equal(isSafeSvgMarkup(source), false);
        assert.throws(
            () => validateAsset({ key: 'primaryLogo', mimeType: 'image/svg+xml', fileName: 'logo.svg', buffer: Buffer.from(source) }),
            (error) => error.code === 'BRANDING_VALIDATION_FAILED'
        );
    }
});
