'use strict';

const { normalizeBranchId, normalizeSectionId } = require('../branches/branch-contract');

/**
 * Financial reporting follows the attribution contract introduced by the
 * financial branch migration:
 * - branch_id on the financial row is authoritative for branch scope.
 * - section scope is available only for membership-backed payments because
 *   expenses and day passes do not carry a section relationship.
 * - all period queries are half-open [start, next), using the event's
 *   business date (paid_at, visit_date, or expense_date).
 */
const FINANCIAL_DATE_FIELDS = Object.freeze({
    subscriptionPayment: 'paid_at',
    dayPass: 'visit_date',
    expense: 'expense_date'
});

function normalizeFinancialScope({ branchId = null, sectionId = null } = {}) {
    return {
        branchId: normalizeBranchId(branchId),
        sectionId: normalizeSectionId(sectionId)
    };
}

function assertSqlIdentifier(value, label) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(value)) {
        throw new Error(`Invalid financial SQL ${label}.`);
    }
    return value;
}

function financialDateRangeSql(column, startParam = '@fromDate', nextParam = '@nextDate') {
    const safeColumn = assertSqlIdentifier(column, 'date column');
    const safeStart = assertSqlIdentifier(startParam.replace(/^@/, ''), 'start parameter');
    const safeNext = assertSqlIdentifier(nextParam.replace(/^@/, ''), 'next parameter');
    return `${safeColumn} >= @${safeStart} AND ${safeColumn} < @${safeNext}`;
}

function bindFinancialScope(request, scope, sql) {
    const normalized = normalizeFinancialScope(scope);
    request
        .input('branchId', sql.Int, normalized.branchId)
        .input('sectionId', sql.Int, normalized.sectionId);
    return normalized;
}

function branchOnlyFinancialScopeSql(alias = 'record') {
    const safeAlias = assertSqlIdentifier(alias, 'row alias');
    return `
              AND (@branchId IS NULL OR ${safeAlias}.branch_id = @branchId)
              AND @sectionId IS NULL`;
}

function subscriptionPaymentScopeSql({ paymentAlias = 'payment_transactions', membershipAlias = 'payment_membership' } = {}) {
    const safePaymentAlias = assertSqlIdentifier(paymentAlias, 'payment alias');
    const safeMembershipAlias = assertSqlIdentifier(membershipAlias, 'membership alias');
    return `
              AND (@branchId IS NULL OR ${safePaymentAlias}.branch_id = @branchId)
              AND (@sectionId IS NULL OR EXISTS (
                  SELECT 1
                  FROM dbo.gym_membership_section_access AS section_scope
                  WHERE section_scope.tenant_id = ${safeMembershipAlias}.tenant_id
                    AND section_scope.membership_id = ${safeMembershipAlias}.id
                    AND section_scope.section_id = @sectionId
              ))`;
}

module.exports = {
    FINANCIAL_DATE_FIELDS,
    bindFinancialScope,
    branchOnlyFinancialScopeSql,
    financialDateRangeSql,
    normalizeFinancialScope,
    subscriptionPaymentScopeSql
};
