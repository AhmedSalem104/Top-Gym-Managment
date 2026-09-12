'use strict';

const {
    getCountries,
    getCountryCallingCode,
    parsePhoneNumberFromString,
    getExampleNumber
} = require('libphonenumber-js/max');
const metadata = require('libphonenumber-js/metadata.full.json');
const mobileExamples = require('libphonenumber-js/examples.mobile.json');

const DEFAULT_COUNTRY = 'EG';
const MOBILE_TYPES = new Set(['MOBILE', 'FIXED_LINE_OR_MOBILE']);
const PHONE_DISPLAY_EXAMPLES = Object.freeze({
    EG: Object.freeze({ national: '01015819700', international: '+201015819700' })
});
let countryOptionsCache;

function normalizeDigits(value) {
    return String(value ?? '')
        .replace(/[\u0660-\u0669]/gu, (digit) => String(digit.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/gu, (digit) => String(digit.charCodeAt(0) - 0x06F0));
}

function phoneError(fieldName = 'Phone number', code = 'INVALID_PHONE', message = null) {
    const error = new Error(message || `${fieldName} is invalid for the selected country.`);
    error.statusCode = 400;
    error.expose = true;
    error.code = code;
    error.field = fieldName;
    return error;
}

function normalizeCountry(value, { required = false } = {}) {
    const country = String(value || DEFAULT_COUNTRY).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country) || !metadata.countries[country]) {
        if (required) throw phoneError('Country', 'PHONE_COUNTRY_UNSUPPORTED', 'The selected country is not supported.');
        return DEFAULT_COUNTRY;
    }
    return country;
}

function compactPhone(value) {
    const normalized = normalizeDigits(value).trim().replace(/[\s().-]/gu, '');
    if (!normalized) return '';
    if (normalized.startsWith('00')) return `+${normalized.slice(2)}`;
    if (normalized.startsWith('+')) return `+${normalized.slice(1).replace(/\D/g, '')}`;
    return normalized.replace(/\D/g, '');
}

function assertPhoneSyntax(value, fieldName) {
    const normalized = normalizeDigits(value).trim();
    if (!normalized) return;
    if (!/^[+\d\s().-]+$/u.test(normalized)
        || /^[^\d+]/u.test(normalized)
        || /\+.*\+/u.test(normalized)
        || (normalized.includes('+') && !/^\+|^00/u.test(normalized))) {
        throw phoneError(fieldName, 'INVALID_PHONE_FORMAT', `${fieldName} contains unsupported characters or format.`);
    }
}

function getMobileLocalPrefix(isoCode, example) {
    const exampleNational = compactPhone(example?.formatNational?.() || '');
    const exampleInternational = compactPhone(example?.number || '');
    const dialCode = getCountryCallingCode(isoCode);
    const nationalDigits = exampleInternational.startsWith('+')
        ? exampleInternational.slice(1 + dialCode.length)
        : '';
    if (!exampleNational || !nationalDigits || !exampleNational.endsWith(nationalDigits)) return '';
    return exampleNational.slice(0, exampleNational.length - nationalDigits.length);
}

function isMobilePhone(phoneNumber) {
    const type = phoneNumber.getType?.();
    return !type || MOBILE_TYPES.has(type);
}

/**
 * Parse and normalize a phone/mobile number using the library's full
 * international metadata. Local input is interpreted only in the selected
 * country; international input must agree with that country when provided.
 */
function normalizePhone(value, {
    country = DEFAULT_COUNTRY,
    required = true,
    allowFixedLine = false,
    fieldName = 'Phone number'
} = {}) {
    assertPhoneSyntax(value, fieldName);
    const raw = compactPhone(value);
    if (!raw) {
        if (!required) return null;
        throw phoneError(fieldName, 'PHONE_REQUIRED', `${fieldName} is required.`);
    }

    const hasSelectedCountry = country !== null && country !== undefined && String(country).trim() !== '';
    const selectedCountry = hasSelectedCountry ? normalizeCountry(country, { required: true }) : null;
    const isInternational = raw.startsWith('+');
    const parsingCountry = selectedCountry || DEFAULT_COUNTRY;
    if (!isInternational && !allowFixedLine) {
        const localPrefix = getMobileLocalPrefix(parsingCountry, getExampleNumber(parsingCountry, mobileExamples));
        if (localPrefix && !raw.startsWith(localPrefix)) {
            throw phoneError(fieldName, 'PHONE_LOCAL_FORMAT', `${fieldName} must use the local mobile format for the selected country.`);
        }
    }
    const phoneNumber = parsePhoneNumberFromString(raw, isInternational ? undefined : parsingCountry);
    if (!phoneNumber || !phoneNumber.isValid()) {
        throw phoneError(fieldName);
    }
    if (isInternational && selectedCountry && phoneNumber.country && phoneNumber.country !== selectedCountry) {
        throw phoneError(fieldName, 'PHONE_COUNTRY_MISMATCH', `${fieldName} does not match the selected country.`);
    }
    if (!allowFixedLine && !isMobilePhone(phoneNumber)) {
        throw phoneError(fieldName, 'MOBILE_NUMBER_REQUIRED', `${fieldName} must be a valid mobile number.`);
    }
    return phoneNumber.number;
}

function normalizeMobile(value, options = {}) {
    return normalizePhone(value, { ...options, allowFixedLine: false });
}

function toMessagingDigits(value, options = {}) {
    const normalized = normalizePhone(value, options);
    return normalized ? normalized.slice(1) : null;
}

function countryName(isoCode) {
    try {
        return new Intl.DisplayNames(['ar'], { type: 'region' }).of(isoCode) || isoCode;
    } catch (_) {
        return isoCode;
    }
}

function countryOption(isoCode) {
    const country = metadata.countries[isoCode];
    const mobileType = country?.[11]?.[1] || null;
    const mobilePattern = mobileType?.[0] || '';
    const mobileLengths = Array.isArray(mobileType?.[1]) ? mobileType[1] : [];
    const example = getExampleNumber(isoCode, mobileExamples);
    const displayExample = PHONE_DISPLAY_EXAMPLES[isoCode];
    const mobileLocalPrefix = getMobileLocalPrefix(isoCode, example);
    return Object.freeze({
        country: countryName(isoCode),
        isoCode,
        dialCode: `+${getCountryCallingCode(isoCode)}`,
        exampleNational: displayExample?.national || example?.formatNational?.() || null,
        exampleInternational: displayExample?.international || example?.number || null,
        validLengths: [...(country?.[3] || [])],
        mobileRules: Object.freeze({
            supported: Boolean(mobileType),
            validLengths: [...mobileLengths],
            prefixValidation: Boolean(mobilePattern),
            localPrefix: mobileLocalPrefix || null,
            // The pattern is public country metadata, not application data.
            // The browser uses it for an early UX check; the server library
            // remains authoritative for the final validation decision.
            nationalPattern: mobilePattern || null,
            numberValidation: 'libphonenumber-js/full metadata',
            validation: 'libphonenumber-js/full metadata'
        })
    });
}

function getSupportedCountries() {
    if (!countryOptionsCache) {
        countryOptionsCache = Object.freeze(getCountries().map(countryOption));
    }
    return countryOptionsCache;
}

module.exports = {
    DEFAULT_COUNTRY,
    normalizeDigits,
    normalizeCountry,
    normalizePhone,
    normalizeMobile,
    toMessagingDigits,
    getSupportedCountries
};
