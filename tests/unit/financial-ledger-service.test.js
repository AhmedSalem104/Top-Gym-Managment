'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ledger = require('../../src/services/financial-ledger-service');

const source = (relativePath) => fs.readFileSync(path.join(__dirname, '../../', relativePath), 'utf8');

test('migrated snapshot and its actual payment are one collection, while two real memberships remain two collections', () => {
    const snapshot = {
        transactionType: 'subscription',
        sourcePaymentId: 392,
        amountPaid: 400,
        isVoided: false
    };
    const actualPayment = {
        transactionType: 'payment',
        sourcePaymentId: null,
        amountPaid: 400,
        isVoided: false
    };

    assert.equal(ledger.classifyLedgerEntry(snapshot, { hasPairedActualPayment: true }), 'migrated_snapshot_duplicate');
    assert.equal(ledger.classifyLedgerEntry(actualPayment), 'actual_collection');
    assert.equal(ledger.classifyLedgerEntry(snapshot, { hasPairedActualPayment: false }), 'actual_collection');
    assert.equal(ledger.classifyLedgerEntry({ ...actualPayment, amountPaid: 125 }), 'actual_collection');
});

test('ledger classification keeps non-cash, refunds, and voided facts out of gross collections', () => {
    assert.equal(ledger.classifyLedgerEntry({ transactionType: 'adjustment', amountPaid: -75, isVoided: false, isRefund: true }), 'refund');
    assert.equal(ledger.classifyLedgerEntry({ transactionType: 'adjustment', amountPaid: -75, isVoided: false }), 'adjustment');
    assert.equal(ledger.classifyLedgerEntry({ transactionType: 'payment', amountPaid: 0, isVoided: false }), 'non_cash');
    assert.equal(ledger.classifyLedgerEntry({ transactionType: 'payment', amountPaid: 250, isVoided: true }), 'voided');
});

test('duplicate exclusion requires migration provenance and the full source/payment fingerprint', () => {
    const sql = ledger.actualCollectionPredicateSql({ transactionAlias: 't', membershipAlias: 'm' });
    for (const requiredFragment of [
        't.source_payment_id IS NOT NULL',
        'source_payment.id = t.source_payment_id',
        'source_payment.membership_id = t.membership_id',
        'actual_payment.transaction_type = \'payment\'',
        'actual_payment.source_payment_id IS NULL',
        'actual_payment.paid_at = source_payment.paid_at',
        'actual_payment.amount_paid = source_payment.amount_paid',
        'actual_payment.created_at >= DATEADD(second, -5, source_payment.updated_at)',
        'actual_payment.created_at <= DATEADD(second, 5, source_payment.updated_at)'
    ]) {
        assert.match(sql, new RegExp(requiredFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(ledger.actualCollectionCaseSql({ transactionAlias: 't', membershipAlias: 'm' }), /t\.transaction_type <> 'adjustment'/);
    assert.match(ledger.refundCaseSql({ transactionAlias: 't' }), /t\.amount_paid < 0/);
    assert.match(ledger.refundCaseSql({ transactionAlias: 't' }), /notes LIKE/);
    assert.match(ledger.snapshotDuplicateConditionSql({ transactionAlias: 't', membershipAlias: 'm' }), /^\s*NOT\s*\(/);
    assert.doesNotMatch(sql, /\b(384|391|392|403|405|415|417|423|424|425|429)\b/);
});

test('all gym financial read paths use the central ledger semantics', () => {
    for (const relativePath of [
        'src/repositories/expense.repository.js',
        'src/services/report-service.js',
        'src/services/analytics-service.js',
        'src/services/platform-admin-service.js',
        'src/services/member-service.js'
    ]) {
        const content = source(relativePath);
        assert.match(content, /financial-ledger-service/);
    }
    assert.match(source('src/services/report-service.js'), /transaction_type <> 'adjustment'/);
    assert.match(source('src/services/platform-admin-service.js'), /payment_transactions\.transaction_type <> 'adjustment'/);
    assert.match(source('src/repositories/expense.repository.js'), /WITH ledger_entries AS/);
    assert.match(source('src/services/analytics-service.js'), /WITH ledger_entries AS/);
    assert.match(source('src/services/report-service.js'), /outstanding_total/);
    assert.doesNotMatch(source('src/repositories/expense.repository.js'), /SUM\(CASE WHEN \$\{actualCollectionCaseSql/);
    assert.doesNotMatch(source('src/services/analytics-service.js'), /SUM\(CASE WHEN \$\{actualCollectionCaseSql/);
});

test('payment transaction runtime readiness is read-only and owns no schema repair/backfill', () => {
    const memberService = source('src/services/member-service.js');
    const start = memberService.indexOf('async function ensurePaymentTransactionsTable');
    const end = memberService.indexOf('async function ensureSubscriptionRefundsTable', start);
    assert.ok(start >= 0 && end > start);
    const readiness = memberService.slice(start, end);
    assert.doesNotMatch(readiness, /CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO|UPDATE\s+dbo\.gym_payment_transactions/i);
    assert.match(readiness, /COL_LENGTH/);
    assert.match(readiness, /PAYMENT_LEDGER_SCHEMA_NOT_READY/);
});

test('financial runtime readiness paths never perform DDL or seed/backfill writes', () => {
    const readinessRanges = [
        ['src/repositories/expense.repository.js', 'ensureExpensesTable', 'getMonthlyData'],
        ['src/repositories/day-pass.repository.js', 'ensureDayPassTables', 'function mapType'],
        ['src/services/member-service.js', 'ensureSubscriptionRefundsTable', 'function requiredString'],
        ['src/services/member-service.js', 'ensurePricingOverrides', 'function positiveValue']
    ];
    for (const [relativePath, startMarker, endMarker] of readinessRanges) {
        const content = source(relativePath);
        const start = content.indexOf(`async function ${startMarker}`);
        const end = content.indexOf(endMarker, start + 1);
        assert.ok(start >= 0 && end > start, `${relativePath}:${startMarker} range must exist`);
        const readiness = content.slice(start, end);
        assert.doesNotMatch(readiness, /CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|INSERT\s+INTO|UPDATE\s+dbo\./i, `${relativePath}:${startMarker} must be read-only`);
        assert.match(readiness, /COL_LENGTH|OBJECT_ID/);
    }
});
