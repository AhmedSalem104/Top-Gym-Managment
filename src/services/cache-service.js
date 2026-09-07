'use strict';

const { performance } = require('node:perf_hooks');
const { config } = require('../config/env');

const MAX_KEY_LENGTH = 512;
const MAX_VALUE_BYTES = 768 * 1024;
const inFlight = new Map();
const counters = { hits: 0, misses: 0, errors: 0, sets: 0, deletes: 0, requests: 0, latencyMs: 0 };

function enabled() {
    return config.cacheEnabled && Boolean(config.cacheGatewayUrl && config.cacheGatewayToken);
}

function cleanSegment(value, fallback = 'unknown') {
    const normalized = String(value ?? '').trim().replace(/[^a-zA-Z0-9_.:-]+/g, '_').slice(0, 120);
    return normalized || fallback;
}

function stableScope(scope = {}) {
    return Object.entries(scope || {})
        .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, value]) => `${cleanSegment(key)}=${cleanSegment(value)}`)
        .join('&') || 'global';
}

function tenantKey({ tenantId, resource, scope = {} } = {}) {
    const id = Number(tenantId);
    if (!Number.isInteger(id) || id <= 0) throw new Error('A valid tenant id is required for a tenant cache key.');
    return `logicfit:${cleanSegment(config.cacheNamespaceVersion, 'v1')}:${cleanSegment(config.cacheEnvironment, 'development')}:tenant:${id}:${cleanSegment(resource)}:${stableScope(scope)}`.slice(0, MAX_KEY_LENGTH);
}

function platformKey({ resource, scope = {} } = {}) {
    return `logicfit:${cleanSegment(config.cacheNamespaceVersion, 'v1')}:${cleanSegment(config.cacheEnvironment, 'development')}:platform:${cleanSegment(resource)}:${stableScope(scope)}`.slice(0, MAX_KEY_LENGTH);
}

function gatewayUrl(operation) {
    return `${String(config.cacheGatewayUrl).replace(/\/+$/, '')}/${String(operation).replace(/^\/+/, '')}`;
}

async function callGateway(operation, body) {
    if (!enabled()) return null;
    counters.requests += 1;
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.cacheGatewayTimeoutMs);
    try {
        const response = await fetch(gatewayUrl(operation), {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.cacheGatewayToken}`
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        if (!response.ok) {
            counters.errors += 1;
            return null;
        }
        return await response.json();
    } catch (_) {
        counters.errors += 1;
        return null;
    } finally {
        clearTimeout(timeout);
        counters.latencyMs += performance.now() - started;
    }
}

async function get(key) {
    if (!enabled() || typeof key !== 'string' || !key || key.length > MAX_KEY_LENGTH) return undefined;
    const result = await callGateway('get', { key });
    if (!result?.hit || typeof result.value !== 'string') {
        counters.misses += 1;
        return undefined;
    }
    try {
        counters.hits += 1;
        return JSON.parse(result.value);
    } catch (_) {
        counters.errors += 1;
        await deleteKey(key);
        return undefined;
    }
}

async function set(key, value, ttlSeconds = 60) {
    if (!enabled() || typeof key !== 'string' || !key || key.length > MAX_KEY_LENGTH || value === undefined) return false;
    let serialized;
    try { serialized = JSON.stringify(value); } catch (_) { return false; }
    if (Buffer.byteLength(serialized, 'utf8') > MAX_VALUE_BYTES) return false;
    const ttl = Math.min(3600, Math.max(1, Math.trunc(Number(ttlSeconds) || 60)));
    const result = await callGateway('set', { key, value: serialized, ttlSeconds: ttl });
    if (result?.ok === true) counters.sets += 1;
    return result?.ok === true;
}

async function deleteKey(key) {
    if (!enabled() || typeof key !== 'string' || !key || key.length > MAX_KEY_LENGTH) return false;
    const result = await callGateway('delete', { keys: [key] });
    if (result?.ok === true) counters.deletes += 1;
    return result?.ok === true;
}

async function deleteMany(keys = []) {
    const normalized = [...new Set(keys.filter((key) => typeof key === 'string' && key && key.length <= MAX_KEY_LENGTH))];
    if (!enabled() || !normalized.length) return false;
    const result = await callGateway('delete', { keys: normalized });
    if (result?.ok === true) counters.deletes += normalized.length;
    return result?.ok === true;
}

async function getOrSet(key, producer, ttlSeconds = 60) {
    if (!enabled()) return producer();
    const existing = inFlight.get(key);
    if (existing) return existing;
    const pending = (async () => {
        const cached = await get(key);
        if (cached !== undefined) return cached;
        const value = await producer();
        await set(key, value, ttlSeconds);
        return value;
    })();
    inFlight.set(key, pending);
    try {
        return await pending;
    } finally {
        if (inFlight.get(key) === pending) inFlight.delete(key);
    }
}

async function health() {
    if (!enabled()) return { enabled: false, status: 'disabled' };
    const result = await callGateway('ping', {});
    return { enabled: true, status: result?.ok === true ? 'healthy' : 'degraded' };
}

function metrics() {
    return {
        enabled: enabled(),
        hits: counters.hits,
        misses: counters.misses,
        errors: counters.errors,
        sets: counters.sets,
        deletes: counters.deletes,
        requests: counters.requests,
        averageLatencyMs: counters.requests ? Math.round((counters.latencyMs / counters.requests) * 100) / 100 : 0
    };
}

module.exports = {
    enabled,
    tenantKey,
    platformKey,
    get,
    set,
    delete: deleteKey,
    deleteMany,
    getOrSet,
    health,
    metrics
};
