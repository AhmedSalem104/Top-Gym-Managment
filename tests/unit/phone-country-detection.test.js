'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildLookupUrl,
    clientIpForRequest,
    createPhoneCountryDetectionService,
    isPrivateIp,
    normalizeCountryCode,
    parseCountryCodeBody
} = require('../../src/services/phone-country-detection-service');

test('client IP uses the trusted request value and excludes private addresses', () => {
    assert.equal(clientIpForRequest({ ip: '203.0.113.10', socket: { remoteAddress: '192.168.0.2' } }), '203.0.113.10');
    assert.equal(clientIpForRequest({ ip: '127.0.0.1', socket: { remoteAddress: '203.0.113.10' } }), '');
    assert.equal(clientIpForRequest({ ip: '::ffff:10.0.0.5' }), '');
    assert.equal(isPrivateIp('::1'), true);
    assert.equal(isPrivateIp('203.0.113.10'), false);
});

test('provider URL is HTTPS, IP-bound and rejects malformed templates', () => {
    assert.match(buildLookupUrl('https://geo.example/{ip}/country', '203.0.113.10'), /203\.0\.113\.10/);
    assert.equal(buildLookupUrl('http://geo.example/{ip}/country', '203.0.113.10'), '');
    assert.equal(buildLookupUrl('https://geo.example/country', '203.0.113.10'), '');
});

test('country response accepts ISO text or JSON and rejects unsafe values', () => {
    assert.equal(normalizeCountryCode(' eg\n'), 'EG');
    assert.equal(parseCountryCodeBody('EG\n'), 'EG');
    assert.equal(parseCountryCodeBody('{"country_code":"SA"}'), 'SA');
    assert.equal(parseCountryCodeBody('{"countryCode":"AE"}'), 'AE');
    assert.equal(parseCountryCodeBody('{"country_code":"Egypt"}'), '');
    assert.equal(parseCountryCodeBody('not-a-country-code'), '');
    assert.equal(parseCountryCodeBody('x'.repeat(129)), '');
});

test('server-side detection returns only a supported country code', async () => {
    const calls = [];
    const service = createPhoneCountryDetectionService({
        endpoint: 'https://geo.example/{ip}/country',
        timeoutMs: 500,
        supportedCountryCodes: ['EG', 'SA', 'AE'],
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, text: async () => 'SA\n' };
        }
    });
    assert.equal(await service.detectCountryCode({ ip: '203.0.113.20' }), 'SA');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.redirect, 'error');
    assert.deepEqual(Object.keys({ countryCode: await service.detectCountryCode({ ip: '192.168.1.5' }) }), ['countryCode']);
});

test('provider failure and unsupported country fail closed to the browser fallback chain', async () => {
    const failed = createPhoneCountryDetectionService({
        endpoint: 'https://geo.example/{ip}/country',
        fetchImpl: async () => { throw new Error('provider unavailable'); }
    });
    assert.equal(await failed.detectCountryCode({ ip: '203.0.113.21' }), '');

    const unsupported = createPhoneCountryDetectionService({
        endpoint: 'https://geo.example/{ip}/country',
        supportedCountryCodes: ['EG', 'SA', 'AE'],
        fetchImpl: async () => ({ ok: true, text: async () => 'US' })
    });
    assert.equal(await unsupported.detectCountryCode({ ip: '203.0.113.22' }), '');
});
