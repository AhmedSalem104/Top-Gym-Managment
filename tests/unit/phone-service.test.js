'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const phoneService = require('../../src/services/phone-service');

test('normalizes Egyptian mobile input from every supported user representation', () => {
    assert.equal(phoneService.normalizeMobile('01012345678', { country: 'EG' }), '+201012345678');
    assert.equal(phoneService.normalizeMobile('01112345678', { country: 'EG' }), '+201112345678');
    assert.equal(phoneService.normalizeMobile('01212345678', { country: 'EG' }), '+201212345678');
    assert.equal(phoneService.normalizeMobile('01512345678', { country: 'EG' }), '+201512345678');
    assert.equal(phoneService.normalizeMobile('+201012345678', { country: 'EG' }), '+201012345678');
    assert.equal(phoneService.normalizeMobile('00201012345678', { country: 'EG' }), '+201012345678');
    assert.equal(phoneService.normalizeMobile('1012345678', { country: 'EG' }), '+201012345678');
    assert.equal(phoneService.normalizeMobile('010 1234 5678', { country: 'EG' }), '+201012345678');
    assert.equal(phoneService.normalizeMobile('010 15819700', { country: 'EG' }), '+201015819700');
    assert.equal(phoneService.normalizeMobile('+20 101 234 5678', { country: 'EG' }), '+201012345678');
    assert.equal(phoneService.normalizeMobile('٠١٠١٢٣٤٥٦٧٨', { country: 'EG' }), '+201012345678');
});

test('canonical normalization makes local and international duplicates identical', () => {
    assert.equal(
        phoneService.normalizeMobile('01012345678', { country: 'EG' }),
        phoneService.normalizeMobile('+201012345678', { country: 'EG' })
    );
});

test('Egypt-only write policy accepts all Egyptian mobile ranges and stores E.164', () => {
    for (const prefix of ['010', '011', '012', '015']) {
        assert.equal(phoneService.normalizeEgyptianMobile(`${prefix}15819700`), `+20${prefix.slice(1)}15819700`);
    }
    assert.equal(phoneService.normalizeEgyptianMobile('010 1581 9700'), '+201015819700');
    assert.equal(phoneService.normalizeEgyptianMobile('+201015819700'), '+201015819700');
    assert.equal(phoneService.normalizeEgyptianMobile('00201015819700'), '+201015819700');
    assert.equal(phoneService.normalizeEgyptianMobile('1015819700'), '+201015819700');
    assert.throws(() => phoneService.normalizeEgyptianMobile('+966501234567'), (error) => error.code === 'PHONE_COUNTRY_MISMATCH');
    assert.throws(() => phoneService.normalizeEgyptianMobile('0223456789'), (error) => error.code === 'MOBILE_NUMBER_REQUIRED');
    assert.throws(() => phoneService.normalizeEgyptianMobile('01015819700abc'), (error) => error.code === 'INVALID_PHONE_FORMAT');
});

test('Egypt-only search policy canonicalizes legacy and local representations equally', () => {
    for (const value of ['01015819700', '1015819700', '+201015819700', '00201015819700', '010 1581 9700']) {
        assert.equal(phoneService.normalizeEgyptianMobileForSearch(value), '+201015819700');
    }
});

test('search normalization uses the same canonical value', () => {
    for (const value of ['01012345678', '1012345678', '+201012345678', '00201012345678', '010 1234 5678']) {
        assert.equal(phoneService.normalizePhoneForSearch(value, { country: 'EG' }), '+201012345678');
    }
});

test('national input is supported for multiple catalog countries without feature regexes', () => {
    assert.equal(phoneService.normalizeMobile('501234567', { country: 'AE' }), '+971501234567');
    assert.equal(phoneService.normalizeMobile('0501234567', { country: 'AE' }), '+971501234567');
    assert.equal(phoneService.normalizeMobile('501234567', { country: 'SA' }), '+966501234567');
    assert.equal(phoneService.normalizeMobile('+96550123456', { country: 'KW' }), '+96550123456');
});

test('returns one canonical phone contract for the backend boundary', () => {
    assert.deepEqual(phoneService.parsePhone('01012345678', { country: 'EG' }), {
        countryIso2: 'EG',
        nationalNumber: '1012345678',
        e164: '+201012345678',
        input: '01012345678'
    });
});

test('selected country controls local parsing and rejects international mismatch', () => {
    assert.equal(phoneService.normalizeMobile('0501234567', { country: 'AE' }), '+971501234567');
    assert.throws(() => phoneService.normalizeMobile('+971501234567', { country: 'EG' }), (error) => error.code === 'PHONE_COUNTRY_MISMATCH');
    assert.throws(() => phoneService.normalizeMobile('01612345678', { country: 'EG' }));
    assert.throws(() => phoneService.normalizeMobile('0223456789', { country: 'EG' }));
    assert.throws(() => phoneService.normalizeMobile('+966501234567', { country: 'EG' }), (error) => error.code === 'PHONE_COUNTRY_MISMATCH');
    assert.equal(phoneService.normalizeMobile('1012345678', { country: 'EG' }), '+201012345678');
    assert.equal(phoneService.normalizeMobile('501234567', { country: 'AE' }), '+971501234567');
});

test('phone syntax rejects letters instead of silently stripping them', () => {
    assert.throws(() => phoneService.normalizeMobile('01012345678abc', { country: 'EG' }), (error) => error.code === 'INVALID_PHONE_FORMAT');
    assert.throws(() => phoneService.normalizeMobile('+20abc1012345678', { country: 'EG' }), (error) => error.code === 'INVALID_PHONE_FORMAT');
});

test('formatted national examples remain parser-compatible across numbering plans', () => {
    assert.equal(phoneService.normalizeMobile('(201) 555-0123', { country: 'US' }), '+12015550123');
    assert.equal(phoneService.normalizeMobile('051 234 5678', { country: 'SA' }), '+966512345678');
    assert.equal(phoneService.normalizeMobile('050 123 4567', { country: 'AE' }), '+971501234567');
    assert.equal(phoneService.normalizeMobile('500 12345', { country: 'KW' }), '+96550012345');
});

test('mobile validation rejects a valid fixed line when mobile is required', () => {
    assert.throws(() => phoneService.normalizeMobile('0223456789', { country: 'EG' }), (error) => error.code === 'MOBILE_NUMBER_REQUIRED');
    assert.equal(phoneService.normalizePhone('0223456789', { country: 'EG', allowFixedLine: true }), '+20223456789');
});

test('country catalog is sourced from full libphonenumber metadata', () => {
    const countries = phoneService.getSupportedCountries();
    assert.ok(countries.length > 200);
    const egypt = countries.find((country) => country.isoCode === 'EG');
    assert.equal(egypt.dialCode, '+20');
    assert.equal(egypt.exampleNational, '01015819700');
    assert.equal(egypt.exampleInternational, '+201015819700');
    assert.deepEqual(egypt.mobileRules.validLengths, [10]);
    assert.equal(egypt.mobileRules.localPrefix, '0');
    assert.match(egypt.mobileRules.nationalPattern, /1\[0-25\]/);
    assert.ok(egypt.validLengths.includes(10));
    assert.equal(egypt.mobileRules.validation, 'libphonenumber-js/full metadata');
});

test('catalog local examples are accepted by the same backend parser', () => {
    for (const isoCode of ['EG', 'SA', 'AE', 'KW', 'US']) {
        const country = phoneService.getSupportedCountries().find((item) => item.isoCode === isoCode);
        assert.ok(country?.exampleNational, `${isoCode} must expose a local example`);
        assert.equal(
            phoneService.normalizeMobile(country.exampleNational, { country: isoCode }),
            country.exampleInternational
        );
    }
});

test('optional phone values stay null while invalid values fail closed', () => {
    assert.equal(phoneService.normalizeMobile('', { country: 'EG', required: false }), null);
    assert.throws(() => phoneService.normalizeMobile('123', { country: 'EG' }), (error) => error.statusCode === 400 && error.expose === true);
    assert.throws(() => phoneService.normalizeMobile('01012345678', { country: 'ZZ' }), (error) => error.code === 'PHONE_COUNTRY_UNSUPPORTED');
});
