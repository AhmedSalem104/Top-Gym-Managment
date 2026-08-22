'use strict';

const crypto = require('node:crypto');

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
    cleanupMs = 300_000
} = {}) {
    const ipWindows = new Map();
    const codeWindows = new Map();
    let lastCleanup = 0;
    return (request, response, next) => {
        if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return next();
        const now = Date.now();
        if (now - lastCleanup > cleanupMs) {
            for (const [key, entry] of ipWindows) if (now - entry.startedAt >= ipWindowMs) ipWindows.delete(key);
            for (const [key, entry] of codeWindows) if (now - entry.startedAt >= codeWindowMs) codeWindows.delete(key);
            lastCleanup = now;
        }
        const ip = request.ip || request.socket.remoteAddress || 'unknown';
        const code = String(request.body?.membershipCode || '').trim().toUpperCase().replace(/[\s-]/g, '');
        const codeDigest = crypto.createHash('sha256').update(code || 'missing').digest('hex');
        const ipEntry = ipWindows.get(ip);
        if (!ipEntry || now - ipEntry.startedAt >= ipWindowMs) ipWindows.set(ip, { startedAt: now, count: 1 });
        else ipEntry.count += 1;
        const codeKey = `${ip}:${codeDigest}`;
        const codeEntry = codeWindows.get(codeKey);
        if (!codeEntry || now - codeEntry.startedAt >= codeWindowMs) codeWindows.set(codeKey, { startedAt: now, count: 1 });
        else codeEntry.count += 1;
        const ipBlocked = ipWindows.get(ip)?.count > ipMax;
        const codeBlocked = codeWindows.get(codeKey)?.count > codeMax;
        if (ipBlocked || codeBlocked) {
            response.set('Retry-After', String(Math.ceil(Math.max(ipWindowMs, codeWindowMs) / 1000)));
            return response.status(429).json({ error: 'تم تجاوز عدد المحاولات المسموح بها مؤقتًا. حاول لاحقًا.' });
        }
        return next();
    };
}

module.exports = { createLoginAttemptGuard, createSensitiveRateLimit, createMembershipPortalRateLimit };
