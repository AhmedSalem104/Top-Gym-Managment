'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const { performance } = require('node:perf_hooks');

const storage = new AsyncLocalStorage();

function recordDatabaseQuery(durationMs, type = 'query') {
    const metrics = storage.getStore();
    if (!metrics) return;
    metrics.dbQueries += 1;
    metrics.dbMs += Number(durationMs) || 0;
    if (metrics.slowest.length < 5 || durationMs > metrics.slowest[metrics.slowest.length - 1].durationMs) {
        metrics.slowest.push({ type, durationMs: Math.round(durationMs * 100) / 100 });
        metrics.slowest.sort((first, second) => second.durationMs - first.durationMs);
        if (metrics.slowest.length > 5) metrics.slowest.pop();
    }
}

function createPerformanceMetrics({ enabled = false, logger = console } = {}) {
    return (request, response, next) => {
        if (!enabled || !request.path.startsWith('/api')) return next();
        const metrics = {
            startedAt: performance.now(),
            dbQueries: 0,
            dbMs: 0,
            slowest: [],
            responseBytes: 0
        };
        storage.run(metrics, () => {
            const originalWrite = response.write;
            const originalEnd = response.end;
            const countBytes = (chunk, encoding) => {
                if (chunk == null) return;
                if (Buffer.isBuffer(chunk) || chunk instanceof Uint8Array) {
                    metrics.responseBytes += chunk.byteLength;
                    return;
                }
                const resolvedEncoding = typeof encoding === 'string' ? encoding : undefined;
                metrics.responseBytes += Buffer.byteLength(String(chunk), resolvedEncoding);
            };
            response.write = function measuredWrite(chunk, encoding, callback) {
                countBytes(chunk, encoding);
                return originalWrite.apply(this, arguments);
            };
            response.end = function measuredEnd(chunk, encoding, callback) {
                countBytes(chunk, encoding);
                return originalEnd.apply(this, arguments);
            };
            response.once('finish', () => {
                const durationMs = performance.now() - metrics.startedAt;
                logger.info('[PERF]', JSON.stringify({
                    method: request.method,
                    path: request.path,
                    status: response.statusCode,
                    durationMs: Math.round(durationMs * 100) / 100,
                    dbQueries: metrics.dbQueries,
                    dbMs: Math.round(metrics.dbMs * 100) / 100,
                    responseBytes: metrics.responseBytes,
                    slowestDb: metrics.slowest
                }));
            });
            next();
        });
    };
}

module.exports = { createPerformanceMetrics, recordDatabaseQuery };
