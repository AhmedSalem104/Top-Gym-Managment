'use strict';

const crypto = require('node:crypto');
const { sql: defaultSql } = require('../database');

const EMAIL_OUTBOX_TABLE = 'dbo.email_outbox';
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 1;
const POLL_INTERVAL_MS = 5_000;
const LEASE_SECONDS = 900;
const RETRY_SECONDS = Object.freeze([30, 120, 600, 1_800]);
const TEMPLATE_BY_EVENT = Object.freeze({
    saas_subscription_request_created: 'saas-subscription-request-v1'
});

function safePayload(event) {
    const payload = event?.payload || {};
    return {
        gymName: String(payload.gymName || '').slice(0, 160),
        planName: String(payload.planName || '').slice(0, 120),
        durationMonths: Number(payload.durationMonths) || 0,
        amountDue: Number.isFinite(Number(payload.amountDue)) ? Number(payload.amountDue) : null,
        currency: String(payload.currency || 'EGP').slice(0, 3),
        submittedAt: String(payload.submittedAt || '').slice(0, 80),
        actionUrl: '/platform-admin.html#subscription-requests'
    };
}

function createEmailOutboxService({ getPool, sql = defaultSql, sendEmailEvent, logger = console } = {}) {
    if (typeof getPool !== 'function') throw new TypeError('Email outbox requires a SQL pool provider.');
    if (typeof sendEmailEvent !== 'function') throw new TypeError('Email outbox requires the configured mail delivery adapter.');

    let timer = null;
    let running = null;
    let stopped = false;

    async function enqueue(event, { executor } = {}) {
        const template = TEMPLATE_BY_EVENT[event?.type];
        if (!template || !event.channels?.email) return { status: 'skipped', reason: 'unsupported_email_event' };
        const request = (executor || await getPool()).request()
            .input('eventType', sql.VarChar(80), event.type)
            .input('entityType', sql.VarChar(80), event.entityType)
            .input('entityId', sql.BigInt, event.entityId)
            .input('recipientReference', sql.VarChar(80), 'platform-admin-config')
            .input('templateKey', sql.VarChar(100), template)
            .input('payloadJson', sql.NVarChar(sql.MAX), JSON.stringify(safePayload(event)))
            .input('idempotencyKey', sql.NVarChar(180), `${event.type}:${event.entityId}`);
        const result = await request.query(`
            IF NOT EXISTS (
                SELECT 1 FROM ${EMAIL_OUTBOX_TABLE} WITH (UPDLOCK,HOLDLOCK)
                WHERE idempotency_key=@idempotencyKey
            )
            BEGIN
                INSERT INTO ${EMAIL_OUTBOX_TABLE}
                    (event_type,entity_type,entity_id,recipient_reference,template_key,payload_json,status,attempts,next_attempt_at,idempotency_key)
                VALUES
                    (@eventType,@entityType,@entityId,@recipientReference,@templateKey,@payloadJson,'pending',0,SYSUTCDATETIME(),@idempotencyKey);
                SELECT CAST(1 AS bit) AS created;
            END
            ELSE SELECT CAST(0 AS bit) AS created;
        `);
        return { status: result.recordset?.[0]?.created ? 'pending' : 'already_enqueued' };
    }

    async function claimBatch(limit = BATCH_SIZE) {
        const leaseToken = crypto.randomUUID();
        const request = (await getPool()).request()
            .input('batchSize', sql.Int, Math.max(1, Math.min(BATCH_SIZE, Number(limit) || BATCH_SIZE)))
            .input('leaseToken', sql.UniqueIdentifier, leaseToken)
            .input('leaseSeconds', sql.Int, LEASE_SECONDS)
            .input('maxAttempts', sql.Int, MAX_ATTEMPTS);
        const result = await request.query(`
            UPDATE ${EMAIL_OUTBOX_TABLE}
            SET status='failed', last_error='max_attempts_exhausted', lease_token=NULL, lease_until=NULL, updated_at=SYSUTCDATETIME()
            WHERE status='processing' AND lease_until<=SYSUTCDATETIME() AND attempts>=@maxAttempts;

            ;WITH claimable AS (
                SELECT TOP (@batchSize) id
                FROM ${EMAIL_OUTBOX_TABLE} WITH (UPDLOCK,READPAST,READCOMMITTEDLOCK,ROWLOCK)
                WHERE attempts<@maxAttempts
                  AND ((status='pending' AND next_attempt_at<=SYSUTCDATETIME())
                    OR (status='processing' AND lease_until<=SYSUTCDATETIME()))
                ORDER BY next_attempt_at,created_at,id
            )
            UPDATE outbox
            SET status='processing', attempts=attempts+1, lease_token=@leaseToken,
                lease_until=DATEADD(SECOND,@leaseSeconds,SYSUTCDATETIME()), updated_at=SYSUTCDATETIME()
            OUTPUT inserted.id,inserted.event_type,inserted.entity_type,inserted.entity_id,
                inserted.recipient_reference,inserted.template_key,inserted.payload_json,
                inserted.attempts,inserted.lease_token
            FROM ${EMAIL_OUTBOX_TABLE} AS outbox
            INNER JOIN claimable ON claimable.id=outbox.id;
        `);
        return result.recordset || [];
    }

    async function updateDelivery(row, result) {
        const pool = await getPool();
        if (result?.status === 'sent') {
            await pool.request()
                .input('id', sql.BigInt, row.id)
                .input('leaseToken', sql.UniqueIdentifier, row.lease_token)
                .query(`UPDATE ${EMAIL_OUTBOX_TABLE} SET status='sent',sent_at=SYSUTCDATETIME(),last_error=NULL,lease_token=NULL,lease_until=NULL,updated_at=SYSUTCDATETIME() WHERE id=@id AND status='processing' AND lease_token=@leaseToken;`);
            return 'sent';
        }
        if (result?.status === 'skipped') {
            await pool.request()
                .input('id', sql.BigInt, row.id)
                .input('leaseToken', sql.UniqueIdentifier, row.lease_token)
                .input('safeError', sql.VarChar(80), result.reason === 'not_configured' ? 'email_not_configured' : 'email_skipped')
                .query(`UPDATE ${EMAIL_OUTBOX_TABLE} SET status='skipped',last_error=@safeError,lease_token=NULL,lease_until=NULL,updated_at=SYSUTCDATETIME() WHERE id=@id AND status='processing' AND lease_token=@leaseToken;`);
            return 'skipped';
        }

        const terminal = Number(row.attempts) >= MAX_ATTEMPTS;
        const retrySeconds = RETRY_SECONDS[Math.max(0, Number(row.attempts) - 1)] || RETRY_SECONDS.at(-1);
        await pool.request()
            .input('id', sql.BigInt, row.id)
            .input('leaseToken', sql.UniqueIdentifier, row.lease_token)
            .input('terminal', sql.Bit, terminal ? 1 : 0)
            .input('retrySeconds', sql.Int, retrySeconds)
            .query(`UPDATE ${EMAIL_OUTBOX_TABLE} SET status=CASE WHEN @terminal=1 THEN 'failed' ELSE 'pending' END,last_error='delivery_failed',next_attempt_at=CASE WHEN @terminal=1 THEN next_attempt_at ELSE DATEADD(SECOND,@retrySeconds,SYSUTCDATETIME()) END,lease_token=NULL,lease_until=NULL,updated_at=SYSUTCDATETIME() WHERE id=@id AND status='processing' AND lease_token=@leaseToken;`);
        return terminal ? 'failed' : 'retry';
    }

    async function processBatch(limit = BATCH_SIZE) {
        if (running) return running;
        running = (async () => {
            const rows = await claimBatch(limit);
            const summary = { claimed: rows.length, sent: 0, skipped: 0, retry: 0, failed: 0 };
            for (const row of rows) {
                let result;
                try {
                    if (row.recipient_reference !== 'platform-admin-config'
                        || TEMPLATE_BY_EVENT[row.event_type] !== row.template_key) {
                        result = { status: 'skipped', reason: 'unsupported_outbox_contract' };
                    } else {
                        const payload = JSON.parse(row.payload_json);
                        result = await sendEmailEvent({
                            type: row.event_type,
                            entityType: row.entity_type,
                            entityId: Number(row.entity_id),
                            tenantId: null,
                            payload
                        });
                    }
                } catch (_) {
                    result = { status: 'failed', reason: 'delivery_failed' };
                }
                const state = await updateDelivery(row, result);
                summary[state] += 1;
                try { logger.info('[EMAIL_OUTBOX_DELIVERY]', { outboxId: Number(row.id), eventType: row.event_type, status: state, attempt: Number(row.attempts) }); } catch (_) { /* safe operational telemetry */ }
            }
            return summary;
        })();
        try { return await running; } finally { running = null; }
    }

    async function runSafely() {
        try {
            const summary = await processBatch();
            if (summary.claimed) {
                try { logger.info('[EMAIL_OUTBOX_CYCLE]', summary); } catch (_) { /* safe operational telemetry */ }
            }
        } catch (_) {
            try { logger.error('[EMAIL_OUTBOX_CYCLE_FAILED]', { code: 'OUTBOX_DATABASE_OR_WORKER_FAILURE' }); } catch (_) { /* safe operational telemetry */ }
        }
    }

    function start() {
        if (timer) return stop;
        stopped = false;
        try { logger.info('[EMAIL_OUTBOX_WORKER_STARTED]', { pollIntervalMs: POLL_INTERVAL_MS, maxAttempts: MAX_ATTEMPTS }); } catch (_) { /* safe operational telemetry */ }
        timer = setInterval(() => { if (!stopped) void runSafely(); }, POLL_INTERVAL_MS);
        timer.unref?.();
        void runSafely();
        return stop;
    }

    async function stop() {
        stopped = true;
        if (timer) clearInterval(timer);
        timer = null;
        if (running) await running;
    }

    async function getStatus() {
        const result = await (await getPool()).request().query(`
            SELECT status,COUNT_BIG(*) AS count
            FROM ${EMAIL_OUTBOX_TABLE}
            GROUP BY status;
        `);
        return Object.fromEntries((result.recordset || []).map((row) => [row.status, Number(row.count || 0)]));
    }

    return Object.freeze({ enqueue, claimBatch, processBatch, start, stop, getStatus });
}

module.exports = {
    BATCH_SIZE, EMAIL_OUTBOX_TABLE, LEASE_SECONDS, MAX_ATTEMPTS, POLL_INTERVAL_MS,
    RETRY_SECONDS, TEMPLATE_BY_EVENT, createEmailOutboxService, safePayload
};
