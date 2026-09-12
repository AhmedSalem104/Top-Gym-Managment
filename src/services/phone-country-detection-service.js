'use strict';

const net = require('node:net');

const DEFAULT_ENDPOINT = 'https://ipapi.co/{ip}/country/';
const DEFAULT_TIMEOUT_MS = 1_500;

function normalizeIp(value) {
    let ip = String(value || '').trim();
    if (ip.startsWith('::ffff:')) ip = ip.slice('::ffff:'.length);
    if (!net.isIP(ip)) return '';
    return ip;
}

function isPrivateIp(ip) {
    const normalized = normalizeIp(ip);
    if (!normalized) return true;
    if (net.isIPv4(normalized)) {
        const octets = normalized.split('.').map(Number);
        const [first, second] = octets;
        return first === 10
            || first === 127
            || (first === 169 && second === 254)
            || (first === 172 && second >= 16 && second <= 31)
            || (first === 192 && second === 168)
            || (first === 0);
    }
    const lower = normalized.toLowerCase();
    return lower === '::1'
        || lower.startsWith('fc')
        || lower.startsWith('fd')
        || lower.startsWith('fe80:');
}

function clientIpForRequest(request) {
    // `request.ip` is trusted only through Express' configured proxy-hop count.
    // Never read an arbitrary forwarded header here: that would let a caller
    // choose the address sent to the geolocation provider.
    const candidate = request?.ip || request?.socket?.remoteAddress || '';
    const ip = normalizeIp(candidate);
    return isPrivateIp(ip) ? '' : ip;
}

function buildLookupUrl(endpoint, ip) {
    const template = String(endpoint || DEFAULT_ENDPOINT).trim();
    if (!template.includes('{ip}')) return '';
    try {
        const url = new URL(template.replaceAll('{ip}', encodeURIComponent(ip)));
        if (url.protocol !== 'https:') return '';
        return url.toString();
    } catch (_) {
        return '';
    }
}

function normalizeCountryCode(value) {
    const code = String(value || '').trim().toUpperCase();
    return /^[A-Z]{2}$/u.test(code) ? code : '';
}

function parseCountryCodeBody(body) {
    const text = String(body || '').trim();
    if (!text || text.length > 128) return '';
    try {
        const parsed = JSON.parse(text);
        return normalizeCountryCode(parsed?.country_code || parsed?.countryCode || parsed?.country);
    } catch (_) {
        return normalizeCountryCode(text);
    }
}

function timeoutSignal(timeoutMs) {
    if (typeof AbortSignal?.timeout !== 'function') return undefined;
    return AbortSignal.timeout(timeoutMs);
}

function createPhoneCountryDetectionService({
    endpoint = DEFAULT_ENDPOINT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
    supportedCountryCodes = null
} = {}) {
    const boundedTimeoutMs = Math.min(5_000, Math.max(250, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
    const supported = supportedCountryCodes
        ? new Set([...supportedCountryCodes].map((code) => normalizeCountryCode(code)).filter(Boolean))
        : null;

    async function detectCountryCode(request) {
        const ip = clientIpForRequest(request);
        const url = buildLookupUrl(endpoint, ip);
        if (!ip || !url || typeof fetchImpl !== 'function') return '';
        try {
            const response = await fetchImpl(url, {
                method: 'GET',
                headers: { Accept: 'text/plain, application/json' },
                redirect: 'error',
                signal: timeoutSignal(boundedTimeoutMs)
            });
            if (!response?.ok || typeof response.text !== 'function') return '';
            const code = parseCountryCodeBody(await response.text());
            return !supported || supported.has(code) ? code : '';
        } catch (_) {
            // IP detection is an optional signal. The browser will continue
            // with timezone, locale and the central catalog fallback.
            return '';
        }
    }

    return Object.freeze({ detectCountryCode });
}

module.exports = {
    DEFAULT_ENDPOINT,
    DEFAULT_TIMEOUT_MS,
    normalizeIp,
    isPrivateIp,
    clientIpForRequest,
    buildLookupUrl,
    normalizeCountryCode,
    parseCountryCodeBody,
    createPhoneCountryDetectionService
};
