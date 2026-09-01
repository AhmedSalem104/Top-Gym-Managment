'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migration = fs.readFileSync(path.join(__dirname, '../../database/migrations/012-payment-ledger-integrity.sql'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8');
const memberService = fs.readFileSync(path.join(__dirname, '../../src/services/member-service.js'), 'utf8');
const reportService = fs.readFileSync(path.join(__dirname, '../../src/services/report-service.js'), 'utf8');
const analyticsService = fs.readFileSync(path.join(__dirname, '../../src/services/analytics-service.js'), 'utf8');
const expenseRepository = fs.readFileSync(path.join(__dirname, '../../src/repositories/expense.repository.js'), 'utf8');
const platformService = fs.readFileSync(path.join(__dirname, '../../src/services/platform-admin-service.js'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '../../public/js/app.js'), 'utf8');
const { assertKnownDuplicate } = require('../../scripts/reconcile-payment-ledger');

test('payment ledger integrity migration is additive, idempotent, and does not delete or rewrite facts', () => {
    assert.match(migration, /is_voided BIT NOT NULL/);
    assert.match(migration, /idempotency_key_hash CHAR\(64\)/);
    assert.match(migration, /CREATE UNIQUE INDEX UX_gym_payment_transactions_idempotency/);
    assert.match(migration, /IF COL_LENGTH\(N'dbo\.gym_payment_transactions', N'is_voided'\) IS NULL/);
    assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(migration, /\bUPDATE\s+dbo\.gym_payment_transactions\b/i);
    assert.match(schema, /CK_gym_payment_transactions_void_state/);
});

test('financial reporting excludes voided ledger corrections consistently', () => {
    assert.match(reportService, /t\.is_voided\s*=\s*0/);
    assert.match(analyticsService, /is_voided\s*=\s*0/);
    assert.match(expenseRepository, /is_voided\s*=\s*0/);
    assert.match(platformService, /is_voided=0/);
    assert.match(memberService, /p\.is_voided\s*=\s*0/);
});

test('new payment mutations use server-side collection dates and hashed idempotency keys', () => {
    assert.match(memberService, /crypto\.createHash\('sha256'\)/);
    assert.match(memberService, /normalizePaymentCollectionDate/);
    assert.match(memberService, /idempotency_key_hash/);
    assert.match(client, /Idempotency-Key/);
    assert.match(client, /body\.paidAt\s*=\s*\$\('paidAt'\)\.value/);
});

test('one-time repair refuses to act unless the audited duplicate fingerprint matches', () => {
    const rows = [
        { transactionId: 365, memberId: 4273, membershipId: 3933, tenantId: 1, amountPaid: 350, paidAt: '2026-09-01', transactionType: 'payment', sourcePaymentId: null, isVoided: false },
        { transactionId: 366, memberId: 4273, membershipId: 3933, tenantId: 1, amountPaid: 350, paidAt: '2026-09-01', transactionType: 'subscription', sourcePaymentId: 3932, isVoided: false }
    ];
    assert.deepEqual(assertKnownDuplicate(rows).duplicate, rows[1]);
    assert.throws(() => assertKnownDuplicate(rows.map((row) => row.transactionId === 366 ? { ...row, amountPaid: 351 } : row)), /fingerprint/i);
});
