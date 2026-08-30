'use strict';

const crypto = require('node:crypto');

function trimMap(map, maxEntries) {
    const limit = Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : 1;
    while (map.size > limit) {
        const oldestKey = map.keys().next().value;
        if (oldestKey === undefined) break;
        map.delete(oldestKey);
    }
}

function setBoundedEntry(map, key, entry, maxEntries) {
    map.set(key, entry);
    trimMap(map, maxEntries);
}

/**
 * Rate-limit policy uses an atomic increment contract instead of knowing how
 * counters are stored. A future shared adapter can implement the same method
 * with an atomic INCR + TTL operation. The local adapter remains the default
 * until an approved distributed backend is configured.
 */
function createMemoryRateLimitStore({ cleanupMs = 300_000, maxEntries = 10_000 } = {}) {
    const entries = new Map();
    let lastCleanup = 0;
    return {
        increment(key, { windowMs = 60_000, now = Date.now() } = {}) {
            const normalizedKey = String(key || 'unknown').slice(0, 512);
            if (now - lastCleanup > cleanupMs) {
                for (const [entryKey, entry] of entries) {
                    if (now - entry.startedAt >= entry.windowMs) entries.delete(entryKey);
                }
                lastCleanup = now;
            }
            const current = entries.get(normalizedKey);
            if (!current || now - current.startedAt >= current.windowMs) {
                const entry = { startedAt: now, windowMs, count: 1 };
                setBoundedEntry(entries, normalizedKey, entry, maxEntries);
                return { count: 1, resetAt: now + windowMs };
            }
            current.count += 1;
            return { count: current.count, resetAt: current.startedAt + current.windowMs };
        },
        size() {
            return entries.size;
        },
        clear() {
            entries.clear();
        }
    };
}

function normalizeStoreResult(result, windowMs) {
    const count = Number(result?.count);
    const resetAt = Number(result?.resetAt);
    if (!Number.isFinite(count) || count < 0 || !Number.isFinite(resetAt)) {
        throw new Error('Rate-limit store returned an invalid counter result.');
    }
    return { count, resetAt: Math.max(Date.now() + windowMs, resetAt) };
}

async function incrementWithFallback(store, fallbackStore, key, options = {}) {
    const windowMs = Number(options.windowMs) > 0 ? Number(options.windowMs) : 60_000;
    try {
        return normalizeStoreResult(await store.increment(key, { ...options, windowMs }), windowMs);
    } catch (_) {
        if (fallbackStore && fallbackStore !== store) {
            try {
                return normalizeStoreResult(await fallbackStore.increment(key, { ...options, windowMs }), windowMs);
            } catch (_) {
                // Fail closed if both the configured backend and its local
                // fallback are unavailable. Never bypass a security policy.
            }
        }
        return { count: Number.MAX_SAFE_INTEGER, resetAt: Date.now() + windowMs, unavailable: true };
    }
}

function rateLimitUnavailable(response) {
    response.set('Retry-After', '30');
    return response.status(503).json({ error: 'خدمة الحماية المؤقتة غير متاحة. حاول مرة أخرى بعد قليل.', code: 'RATE_LIMIT_UNAVAILABLE' });
}

function requestIp(request) {
    return request.ip || request.socket?.remoteAddress || 'unknown';
}

function isMembershipPortalOccupancyRequest(request) {
    const path = String(request.path || '').split('?')[0];
    const originalPath = String(request.originalUrl || '').split('?')[0];
    return path === '/occupancy'
        || path === '/member-portal/occupancy'
        || originalPath.endsWith('/api/member-portal/occupancy');
}

function createSensitiveRateLimit({ windowMs = 60_000, max = 120, cleanupMs = 300_000, maxEntries = 10_000, store = null, fallbackStore = null } = {}) {
    const primaryStore = store || createMemoryRateLimitStore({ cleanupMs, maxEntries });
    const safeFallbackStore = fallbackStore || createMemoryRateLimitStore({ cleanupMs, maxEntries });
    return (request, response, next) => {
        if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return next();
        const key = `sensitive:ip:${requestIp(request)}`;
        return incrementWithFallback(primaryStore, safeFallbackStore, key, { windowMs })
            .then((result) => {
                if (result.unavailable) return rateLimitUnavailable(response);
                if (result.count > max) {
                    response.set('Retry-After', String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))));
                    return response.status(429).json({ error: 'تم تجاوز عدد العمليات المسموح به مؤقتًا. حاول بعد دقيقة.' });
                }
                return next();
            });
    };
}

function createLoginAttemptGuard({ windowMs = 900_000, max = 10, cleanupMs = 300_000, maxEntries = 20_000, store = null, fallbackStore = null } = {}) {
    const primaryStore = store || createMemoryRateLimitStore({ cleanupMs, maxEntries });
    const safeFallbackStore = fallbackStore || createMemoryRateLimitStore({ cleanupMs, maxEntries });
    return async (request, email) => {
        const normalizedEmail = String(email || '').trim().toLowerCase().slice(0, 254);
        const key = `login:${requestIp(request)}:${normalizedEmail}`;
        const result = await incrementWithFallback(primaryStore, safeFallbackStore, key, { windowMs });
        return !result.unavailable && result.count <= max;
    };
}

/**
 * The public portal accepts a bearer-like membership code, so it gets a
 * separate IP + code bucket. Only a one-way digest is kept in memory; the
 * submitted code is never logged or retained in plaintext.
 */
function createMembershipPortalRateLimit({
    ipWindowMs = 60_000,
    ipMax = 30,
    codeWindowMs = 900_000,
    codeMax = 8,
    occupancyIpWindowMs = 60_000,
    occupancyIpMax = 60,
    occupancyCodeWindowMs = 900_000,
    occupancyCodeMax = 60,
    cleanupMs = 300_000,
    maxEntries = 20_000,
    store = null,
    fallbackStore = null
} = {}) {
    const primaryStore = store || createMemoryRateLimitStore({ cleanupMs, maxEntries });
    const safeFallbackStore = fallbackStore || createMemoryRateLimitStore({ cleanupMs, maxEntries });
    return (request, response, next) => {
        if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return next();
        const ip = requestIp(request);
        const code = String(request.body?.membershipCode || '').trim().toUpperCase().replace(/[\s-]/g, '');
        const codeDigest = crypto.createHash('sha256').update(code || 'missing').digest('hex');
        const isOccupancyRequest = isMembershipPortalOccupancyRequest(request);
        const bucket = isOccupancyRequest ? 'occupancy' : 'lookup';
        const activeIpWindowMs = isOccupancyRequest ? occupancyIpWindowMs : ipWindowMs;
        const activeIpMax = isOccupancyRequest ? occupancyIpMax : ipMax;
        const activeCodeWindowMs = isOccupancyRequest ? occupancyCodeWindowMs : codeWindowMs;
        const activeCodeMax = isOccupancyRequest ? occupancyCodeMax : codeMax;
        const ipKey = `portal:${bucket}:ip:${ip}`;
        const codeKey = `portal:${bucket}:code:${ip}:${codeDigest}`;
        return Promise.all([
            incrementWithFallback(primaryStore, safeFallbackStore, ipKey, { windowMs: activeIpWindowMs }),
            incrementWithFallback(primaryStore, safeFallbackStore, codeKey, { windowMs: activeCodeWindowMs })
        ]).then(([ipResult, codeResult]) => {
            if (ipResult.unavailable || codeResult.unavailable) return rateLimitUnavailable(response);
            const ipBlocked = ipResult.count > activeIpMax;
            const codeBlocked = codeResult.count > activeCodeMax;
            if (ipBlocked || codeBlocked) {
                const resetAt = Math.max(ipResult.resetAt, codeResult.resetAt);
                response.set('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
                return response.status(429).json({ error: 'تم تجاوز عدد المحاولات المسموح بها مؤقتًا. حاول لاحقًا.' });
            }
            return next();
        });
    };
}

/**
 * Backup actions can serialize a large amount of tenant data and are not
 * suitable for the broad sensitive-write budget. This policy is intentionally
 * scoped by trusted tenant/user context plus IP. It can use the same atomic
 * shared-store contract later; the bounded in-memory stores remain the local
 * fallback and never become a cross-instance guarantee.
 */
function createBackupActionRateLimit({
    windowMs = 10 * 60_000,
    max = 6,
    cleanupMs = 300_000,
    maxEntries = 20_000,
    store = null,
    fallbackStore = null
} = {}) {
    const primaryStore = store || createMemoryRateLimitStore({ cleanupMs, maxEntries });
    const safeFallbackStore = fallbackStore || createMemoryRateLimitStore({ cleanupMs, maxEntries });
    return (request, response, next) => {
        const tenantId = Number(request.tenant?.id);
        const userId = Number(request.auth?.id);
        const scope = Number.isInteger(tenantId) && tenantId > 0
            ? `tenant:${tenantId}`
            : Number.isInteger(userId) && userId > 0 ? `user:${userId}` : 'anonymous';
        const key = `backup-action:${scope}:ip:${requestIp(request)}`;
        return incrementWithFallback(primaryStore, safeFallbackStore, key, { windowMs })
            .then((result) => {
                if (result.unavailable) return rateLimitUnavailable(response);
                if (result.count > max) {
                    response.set('Retry-After', String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))));
                    return response.status(429).json({ error: 'تم تجاوز عدد عمليات النسخ المسموح بها مؤقتًا. حاول لاحقًا.', code: 'BACKUP_RATE_LIMITED' });
                }
                return next();
            });
    };
}

module.exports = {
    createBackupActionRateLimit,
    createLoginAttemptGuard,
    createMemoryRateLimitStore,
    createSensitiveRateLimit,
    createMembershipPortalRateLimit,
    trimMap
};
