'use strict';

require('dotenv').config();

const { closePool, getPool, sql } = require('../src/database');
const { withTransaction } = require('../src/database/transaction');
const { runTenantContext } = require('../src/tenancy/tenant-context');
const saasService = require('../src/services/saas-service');

const TENANT_ID = 1;
const DUPLICATE_TRANSACTION_ID = 366;
const ORIGINAL_TRANSACTION_ID = 365;
const SOURCE_PAYMENT_ID = 3932;
const EXPECTED_AMOUNT = 350;
const EXPECTED_PAID_AT = '2026-09-01';
const APPLY_CONFIRMATION = 'I_UNDERSTAND_PAYMENT_LEDGER_REPAIR';
const VOID_REASON = 'تصحيح تكرار ناتج عن ترحيل قديم: تم الاحتفاظ بالدفعة الأصلية وإبطال السجل المكرر دون حذفه.';

function flag(name) {
    return process.argv.includes(name);
}

function assertApplyConfirmation() {
    if (process.env.PAYMENT_LEDGER_REPAIR_CONFIRM !== APPLY_CONFIRMATION) {
        throw new Error(`Apply requires PAYMENT_LEDGER_REPAIR_CONFIRM=${APPLY_CONFIRMATION}.`);
    }
}

function dateOnly(value) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
}

function publicRow(row) {
    if (!row) return null;
    return {
        transactionId: Number(row.transaction_id),
        memberId: Number(row.member_id),
        memberName: row.member_name || null,
        membershipId: Number(row.membership_id),
        tenantId: Number(row.tenant_id),
        amountPaid: Number(row.amount_paid),
        paidAt: dateOnly(row.paid_at),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        transactionType: row.transaction_type,
        sourcePaymentId: row.source_payment_id == null ? null : Number(row.source_payment_id),
        isVoided: Boolean(row.is_voided),
        voidedAt: row.voided_at instanceof Date ? row.voided_at.toISOString() : row.voided_at,
        voidReason: row.void_reason || null
    };
}

async function readTargetRows(pool) {
    const result = await pool.request()
        .input('tenantId', sql.Int, TENANT_ID)
        .input('duplicateId', sql.Int, DUPLICATE_TRANSACTION_ID)
        .input('originalId', sql.Int, ORIGINAL_TRANSACTION_ID)
        .query(`SELECT t.id AS transaction_id,t.membership_id,t.transaction_type,t.amount_paid,t.paid_at,
                       t.source_payment_id,t.is_voided,t.voided_at,t.void_reason,t.created_at,
                       m.member_id,m.tenant_id,member.full_name AS member_name
                FROM dbo.gym_payment_transactions AS t
                INNER JOIN dbo.memberships AS m ON m.id=t.membership_id
                INNER JOIN dbo.members AS member ON member.id=m.member_id
                WHERE m.tenant_id=@tenantId AND t.id IN (@duplicateId,@originalId)
                ORDER BY t.id;`);
    return result.recordset.map(publicRow);
}

function findRow(rows, id) {
    return rows.find((row) => row.transactionId === id) || null;
}

function assertKnownDuplicate(rows) {
    const duplicate = findRow(rows, DUPLICATE_TRANSACTION_ID);
    const original = findRow(rows, ORIGINAL_TRANSACTION_ID);
    if (!duplicate || !original) throw new Error('Known duplicate pair was not found exactly in the selected tenant. No data changed.');
    const sameScope = duplicate.tenantId === TENANT_ID
        && original.tenantId === TENANT_ID
        && duplicate.memberId === original.memberId
        && duplicate.membershipId === original.membershipId;
    const duplicateMatches = duplicate.amountPaid === EXPECTED_AMOUNT
        && duplicate.paidAt === EXPECTED_PAID_AT
        && duplicate.transactionType === 'subscription'
        && duplicate.sourcePaymentId === SOURCE_PAYMENT_ID
        && !duplicate.isVoided;
    const originalMatches = original.amountPaid === EXPECTED_AMOUNT
        && original.transactionType === 'payment'
        && original.sourcePaymentId === null
        && !original.isVoided;
    if (!sameScope || !duplicateMatches || !originalMatches) {
        throw new Error('Known duplicate pair no longer matches its audited fingerprint. No data changed.');
    }
    return { duplicate, original };
}

async function readSummary(pool, membershipId) {
    const summary = await pool.request()
        .input('membershipId', sql.Int, membershipId)
        .query('SELECT ISNULL(SUM(amount_paid),0) AS summary_total FROM dbo.gym_payments WHERE membership_id=@membershipId;');
    const source = await pool.request()
        .input('membershipId', sql.Int, membershipId)
        .input('sourcePaymentId', sql.Int, SOURCE_PAYMENT_ID)
        .query('SELECT TOP (1) id,amount_paid,paid_at FROM dbo.gym_payments WHERE id=@sourcePaymentId AND membership_id=@membershipId;');
    const row = summary.recordset[0] || {};
    const sourceRow = source.recordset[0] || null;
    return {
        summaryTotal: Number(row.summary_total || 0),
        sourcePayment: sourceRow ? {
            id: Number(sourceRow.id),
            amountPaid: Number(sourceRow.amount_paid),
            paidAt: dateOnly(sourceRow.paid_at)
        } : null
    };
}

async function readSeptemberLedger(pool) {
    const result = await pool.request()
        .input('tenantId', sql.Int, TENANT_ID)
        .query(`SELECT t.id AS transaction_id,t.membership_id,t.transaction_type,t.amount_paid,t.paid_at,
                       t.source_payment_id,t.is_voided,t.voided_at,t.void_reason,t.created_at,
                       m.member_id,m.tenant_id,member.full_name AS member_name
                FROM dbo.gym_payment_transactions AS t
                INNER JOIN dbo.memberships AS m ON m.id=t.membership_id
                INNER JOIN dbo.members AS member ON member.id=m.member_id
                WHERE m.tenant_id=@tenantId
                  AND t.paid_at >= CONVERT(date,'2026-09-01')
                  AND t.paid_at < CONVERT(date,'2026-10-01')
                  AND t.amount_paid <> 0
                ORDER BY t.paid_at,t.id;`);
    return result.recordset.map(publicRow);
}

async function readTotals(pool) {
    const result = await pool.request()
        .input('tenantId', sql.Int, TENANT_ID)
        .query(`SELECT COUNT_BIG(*) AS row_count, ISNULL(SUM(amount_paid),0) AS total
                FROM dbo.gym_payment_transactions AS t
                INNER JOIN dbo.memberships AS m ON m.id=t.membership_id
                WHERE m.tenant_id=@tenantId
                  AND t.paid_at >= CONVERT(date,'2026-09-01')
                  AND t.paid_at < CONVERT(date,'2026-10-01')
                  AND t.amount_paid <> 0
                  AND t.is_voided=0;`);
    const row = result.recordset[0] || {};
    return { rows: Number(row.row_count || 0), total: Number(row.total || 0) };
}

async function ensureRepairPrerequisites(pool) {
    const result = await pool.request().query(`SELECT
        CASE WHEN OBJECT_ID(N'dbo.gym_payment_transactions',N'U') IS NOT NULL THEN 1 ELSE 0 END AS ledger_exists,
        CASE WHEN OBJECT_ID(N'dbo.saas_audit_log',N'U') IS NOT NULL THEN 1 ELSE 0 END AS audit_exists,
        CASE WHEN COL_LENGTH(N'dbo.gym_payment_transactions',N'is_voided') IS NOT NULL THEN 1 ELSE 0 END AS void_column_exists;`);
    const row = result.recordset[0] || {};
    if (!row.ledger_exists || !row.audit_exists || !row.void_column_exists) {
        throw new Error('Payment ledger repair prerequisites are not ready. Run the controlled migration first. No data changed.');
    }
}

async function applyRepair({ duplicate, original }) {
    return withTransaction(async (transaction) => {
        const update = await transaction.request()
            .input('transactionId', sql.Int, duplicate.transactionId)
            .input('amount', sql.Decimal(12, 2), EXPECTED_AMOUNT)
            .input('membershipId', sql.Int, duplicate.membershipId)
            .input('sourcePaymentId', sql.Int, SOURCE_PAYMENT_ID)
            .input('reason', sql.NVarChar(500), VOID_REASON)
            .query(`UPDATE dbo.gym_payment_transactions
                    SET is_voided=1,voided_at=SYSUTCDATETIME(),voided_by_user_id=NULL,void_reason=@reason
                    WHERE id=@transactionId AND membership_id=@membershipId
                      AND transaction_type='subscription' AND amount_paid=@amount
                      AND source_payment_id=@sourcePaymentId AND paid_at=CONVERT(date,'2026-09-01')
                      AND is_voided=0;`);
        if (Number(update.rowsAffected?.[0] || 0) !== 1) {
            throw new Error('The duplicate row changed during reconciliation. Transaction rolled back.');
        }
        await saasService.recordAudit({
            tenantId: TENANT_ID,
            action: 'payment_ledger_corrected',
            entityType: 'gym_payment_transaction',
            entityId: duplicate.transactionId,
            details: `تم إبطال سجل الدفع المكرر ${duplicate.transactionId} مع الإبقاء على سجل الدفع الأصلي ${original.transactionId}.`,
            reason: VOID_REASON,
            before: duplicate,
            after: { ...duplicate, isVoided: true, voidReason: VOID_REASON },
            executor: transaction
        });
        return true;
    });
}

async function reconcile() {
    const shouldApply = flag('--apply');
    const shouldVerify = flag('--verify');
    if (shouldApply && shouldVerify) throw new Error('Choose either --apply or --verify, not both.');
    if (shouldApply) assertApplyConfirmation();
    return runTenantContext({ mode: 'platform', tenantId: TENANT_ID }, async () => {
        const pool = await getPool();
        await ensureRepairPrerequisites(pool);
        const rows = await readTargetRows(pool);
        if (shouldVerify) {
            const duplicate = findRow(rows, DUPLICATE_TRANSACTION_ID);
            const original = findRow(rows, ORIGINAL_TRANSACTION_ID);
            if (!duplicate || !original || !duplicate.isVoided || original.isVoided) {
                throw new Error('Post-repair state is not the expected voided-duplicate/original pair. No data changed.');
            }
            const totals = await readTotals(pool);
            const septemberRows = await readSeptemberLedger(pool);
            console.log(JSON.stringify({
                mode: 'verify',
                tenantId: TENANT_ID,
                duplicate,
                original,
                totals,
                septemberRows,
                note: 'Verification only; no data changed.'
            }, null, 2));
            return;
        }
        const pair = assertKnownDuplicate(rows);
        const summary = await readSummary(pool, pair.duplicate.membershipId);
        if (summary.summaryTotal !== EXPECTED_AMOUNT || !summary.sourcePayment
            || summary.sourcePayment.id !== SOURCE_PAYMENT_ID
            || summary.sourcePayment.amountPaid !== EXPECTED_AMOUNT) {
            throw new Error('The related gym_payments summary does not match the audited duplicate fingerprint. No data changed.');
        }
        const beforeTotals = await readTotals(pool);
        const septemberRowsBefore = await readSeptemberLedger(pool);
        if (shouldApply) await applyRepair(pair);
        const afterTotals = await readTotals(pool);
        const septemberRowsAfter = await readSeptemberLedger(pool);
        console.log(JSON.stringify({
            mode: shouldApply ? 'apply' : 'dry-run',
            tenantId: TENANT_ID,
            knownDuplicate: pair.duplicate,
            originalTransaction: pair.original,
            relatedPaymentSummary: summary,
            before: { totals: beforeTotals, septemberRows: septemberRowsBefore },
            after: { totals: afterTotals, septemberRows: septemberRowsAfter },
            datesRequiringExternalEvidence: septemberRowsAfter.filter((row) => row.transactionId !== DUPLICATE_TRANSACTION_ID),
            note: 'No paid_at value was changed. The remaining collection dates require external evidence.'
        }, null, 2));
    });
}

if (require.main === module) {
    reconcile()
        .catch((error) => {
            console.error('PAYMENT_LEDGER_RECONCILIATION_FAILED', error.message);
            process.exitCode = 1;
        })
        .finally(() => closePool().catch(() => {}));
}

module.exports = {
    assertKnownDuplicate,
    reconcile,
    APPLY_CONFIRMATION,
    DUPLICATE_TRANSACTION_ID,
    ORIGINAL_TRANSACTION_ID
};
