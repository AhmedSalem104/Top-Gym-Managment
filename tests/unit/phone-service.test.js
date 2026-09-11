'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const phoneService = require('../../src/services/phone-service');

test('normalizes Egyptian mobile input from local, international and Arabic digits', () => {
    assert.equal(phoneService.normalizeMobile('01012345678', { country: 'EG' }), '+201012345678');
    assert.equal(phoneService.normalizeMobile('+201012345678', { country: 'EG' }), '+201012345678');
    assert.equal(phoneService.normalizeMobile('00201012345678', { country: 'EG' }), '+201012345678');
    assert.equal(phoneService.normalizeMobile('٠١٠١٢٣٤٥٦٧٨', { country: 'EG' }), '+201012345678');
});

test('selected country controls local parsing and rejects international mismatch', () => {
    assert.equal(phoneService.normalizeMobile('0501234567', { country: 'AE' }), '+971501234567');
    assert.throws(() => phoneService.normalizeMobile('+971501234567', { country: 'EG' }), (error) => error.code === 'PHONE_COUNTRY_MISMATCH');
    assert.throws(() => phoneService.normalizeMobile('01612345678', { country: 'EG' }));
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
    assert.equal(egypt.exampleNational, '010 01234567');
    assert.equal(egypt.exampleInternational, '+201001234567');
    assert.deepEqual(egypt.mobileRules.validLengths, [10]);
    assert.match(egypt.mobileRules.nationalPattern, /1\[0-25\]/);
    assert.ok(egypt.validLengths.includes(10));
    assert.equal(egypt.mobileRules.validation, 'libphonenumber-js/full metadata');
});

test('optional phone values stay null while invalid values fail closed', () => {
    assert.equal(phoneService.normalizeMobile('', { country: 'EG', required: false }), null);
    assert.throws(() => phoneService.normalizeMobile('123', { country: 'EG' }), (error) => error.statusCode === 400 && error.expose === true);
    assert.throws(() => phoneService.normalizeMobile('01012345678', { country: 'ZZ' }), (error) => error.code === 'PHONE_COUNTRY_UNSUPPORTED');
});
