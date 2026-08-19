'use strict';

function createSensitiveRateLimit({ windowMs = 60_000, max = 120, cleanupMs = 300_000 } = {}) {
    const windows = new Map();
    let lastCleanup = 0;
    return (request, response, next) => {
        if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return next();
        const now = Date.now();
        if (now - lastCleanup > cleanupMs) {
            for (const [key, entry] of windows) {
                if (now - entry.startedAt >= windowMs) windows.delete(key);
            }
            lastCleanup = now;
        }
        const key = request.ip || request.socket.remoteAddress || 'unknown';
        const current = windows.get(key);
        if (!current || now - current.startedAt >= windowMs) {
            windows.set(key, { startedAt: now, count: 1 });
            return next();
        }
        current.count += 1;
        if (current.count > max) {
            response.set('Retry-After', String(Math.ceil(windowMs / 1000)));
            return response.status(429).json({ error: 'تم تجاوز عدد العمليات المسموح به مؤقتًا. حاول بعد دقيقة.' });
        }
        return next();
    };
}

function createLoginAttemptGuard({ windowMs = 900_000, max = 10, cleanupMs = 300_000 } = {}) {
    const attempts = new Map();
    let lastCleanup = 0;
    return (request, email) => {
        const now = Date.now();
        if (now - lastCleanup > cleanupMs) {
            for (const [key, entry] of attempts) {
                if (now - entry.startedAt >= windowMs) attempts.delete(key);
            }
            lastCleanup = now;
        }
        const key = `${request.ip || request.socket.remoteAddress || 'unknown'}:${String(email || '').trim().toLowerCase()}`;
        const current = attempts.get(key);
        if (!current || now - current.startedAt >= windowMs) {
            attempts.set(key, { startedAt: now, count: 1 });
            return true;
        }
        current.count += 1;
        return current.count <= max;
    };
}

module.exports = { createLoginAttemptGuard, createSensitiveRateLimit };
