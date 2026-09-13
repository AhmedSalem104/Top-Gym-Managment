'use strict';

/**
 * Financial truth for Gym membership collections.
 *
 * A migrated gym_payments snapshot remains an immutable historical fact. It
 * must not be counted a second time when the same source payment also has a
 * real append-only payment transaction. The predicate below requires the
 * source-payment relationship, the complete money/payment fingerprint, the
 * membership tenant, and the source update/payment timestamps before it
 * classifies a snapshot as a duplicate ledger representation.
 */

function assertSqlIdentifier(value, label) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(value)) {
        throw new Error(`Invalid financial ledger SQL ${label}.`);
    }
    return value;
}

function snapshotDuplicateConditionSql({ transactionAlias = 'payment_transactions', membershipAlias = 'payment_membership' } = {}) {
    const transaction = assertSqlIdentifier(transactionAlias, 'transaction alias');
    const membership = assertSqlIdentifier(membershipAlias, 'membership alias');
    return `
              NOT (
                  ${transaction}.transaction_type = 'subscription'
                  AND ${transaction}.source_payment_id IS NOT NULL
                  AND EXISTS (
                      SELECT 1
                      FROM dbo.gym_payments AS source_payment
                      INNER JOIN dbo.memberships AS source_membership
                          ON source_membership.id = source_payment.membership_id
                         AND source_membership.tenant_id = ${membership}.tenant_id
                      INNER JOIN dbo.gym_payment_transactions AS actual_payment
                          ON actual_payment.membership_id = source_payment.membership_id
                         AND actual_payment.transaction_type = 'payment'
                         AND actual_payment.source_payment_id IS NULL
                         AND actual_payment.is_voided = 0
                         AND actual_payment.paid_at = source_payment.paid_at
                         AND actual_payment.list_price = source_payment.list_price
                         AND actual_payment.discount_amount = source_payment.discount_amount
                         AND actual_payment.amount_due = source_payment.amount_due
                         AND actual_payment.amount_paid = source_payment.amount_paid
                         AND actual_payment.amount_remaining = source_payment.amount_remaining
                         AND actual_payment.payment_method = source_payment.payment_method
                         AND actual_payment.created_at >= DATEADD(second, -5, source_payment.updated_at)
                         AND actual_payment.created_at <= DATEADD(second, 5, source_payment.updated_at)
                      WHERE source_payment.id = ${transaction}.source_payment_id
                        AND source_payment.membership_id = ${transaction}.membership_id
                        AND source_payment.list_price = ${transaction}.list_price
                        AND source_payment.discount_amount = ${transaction}.discount_amount
                        AND source_payment.amount_due = ${transaction}.amount_due
                        AND source_payment.amount_paid = ${transaction}.amount_paid
                        AND source_payment.amount_remaining = ${transaction}.amount_remaining
                        AND source_payment.payment_method = ${transaction}.payment_method
                  )
              )`;
}

function actualCollectionPredicateSql(options = {}) {
    return `AND ${snapshotDuplicateConditionSql(options)}`;
}

function actualCollectionCaseSql(options = {}) {
    const transaction = assertSqlIdentifier(options.transactionAlias || 'payment_transactions', 'transaction alias');
    return `(CASE WHEN ${transaction}.is_voided = 0
                       AND ${transaction}.transaction_type <> 'adjustment'
                       AND ${transaction}.amount_paid > 0
                       ${actualCollectionPredicateSql(options)}
                 THEN 1 ELSE 0 END)`;
}

function refundCaseSql({ transactionAlias = 'payment_transactions' } = {}) {
    const transaction = assertSqlIdentifier(transactionAlias, 'transaction alias');
    return `(CASE WHEN ${transaction}.is_voided = 0
                       AND ${transaction}.transaction_type = 'adjustment'
                       AND ${transaction}.amount_paid < 0
                       AND ${transaction}.notes LIKE N'استرجاع اشتراك:%'
                 THEN 1 ELSE 0 END)`;
}

function classifyLedgerEntry(entry = {}, { hasPairedActualPayment = false } = {}) {
    if (entry.isVoided) return 'voided';
    const amountPaid = Number(entry.amountPaid || 0);
    if (entry.transactionType === 'subscription' && entry.sourcePaymentId != null && hasPairedActualPayment) {
        return 'migrated_snapshot_duplicate';
    }
    if (entry.transactionType === 'adjustment' && amountPaid < 0 && (entry.isRefund || String(entry.notes || '').startsWith('استرجاع اشتراك:'))) return 'refund';
    if (entry.transactionType === 'adjustment') return 'adjustment';
    if (amountPaid > 0) return 'actual_collection';
    return 'non_cash';
}

module.exports = {
    actualCollectionCaseSql,
    actualCollectionPredicateSql,
    classifyLedgerEntry,
    refundCaseSql,
    snapshotDuplicateConditionSql
};
