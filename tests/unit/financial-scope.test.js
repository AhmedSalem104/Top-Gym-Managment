'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const scope = require('../../src/repositories/financial-scope');

test('financial scope normalizes branch and section context centrally', () => {
    assert.deepEqual(scope.normalizeFinancialScope({ branchId: '12', sectionId: '7' }), { branchId: 12, sectionId: 7 });
    assert.deepEqual(scope.normalizeFinancialScope({ branchId: 'invalid', sectionId: 0 }), { branchId: null, sectionId: null });
});

test('financial date ranges are half-open and reject unsafe SQL identifiers', () => {
    assert.equal(
        scope.financialDateRangeSql('payment_transactions.paid_at', '@startDate', '@nextDate'),
        'payment_transactions.paid_at >= @startDate AND payment_transactions.paid_at < @nextDate'
    );
    assert.throws(() => scope.financialDateRangeSql('paid_at; DROP TABLE members'), /Invalid financial SQL date column/);
});

test('subscription financial scope uses payment attribution plus membership section access', () => {
    const sql = scope.subscriptionPaymentScopeSql({ paymentAlias: 't', membershipAlias: 'ms' });
    assert.match(sql, /t\.branch_id = @branchId/u);
    assert.match(sql, /section_scope\.tenant_id = ms\.tenant_id/u);
    assert.match(sql, /section_scope\.membership_id = ms\.id/u);
    assert.doesNotMatch(sql, /gym_membership_branch_access/u);
});

test('dashboard, reports and monthly finance share the same financial scope boundary', () => {
    const sources = [
        read('src/repositories/expense.repository.js'),
        read('src/services/analytics-service.js'),
        read('src/services/report-service.js'),
        read('src/repositories/day-pass.repository.js')
    ];
    for (const source of sources) {
        assert.match(source, /financialDateRangeSql/u);
        assert.match(source, /branchOnlyFinancialScopeSql|subscriptionPaymentScopeSql/u);
    }
    assert.doesNotMatch(read('src/services/analytics-service.js'), /\$\{membershipScope\('payment_membership'\)\}/u);
    assert.doesNotMatch(read('src/services/report-service.js'), /\$\{membershipScope\('payment_membership'\)\}/u);
});

test('day-pass pagination remains compatible with the production SQL Server compatibility level', () => {
    const source = read('src/repositories/day-pass.repository.js');
    const start = source.indexOf('async function listSales');
    const end = source.indexOf('async function getRangeData', start);
    assert.ok(start >= 0 && end > start);
    const listSales = source.slice(start, end);
    assert.match(listSales, /ROW_NUMBER\(\) OVER \(ORDER BY s\.visit_date DESC, s\.id DESC\)/u);
    assert.match(listSales, /row_num > @offset AND row_num <= \(@offset \+ @pageSize\)/u);
    assert.doesNotMatch(listSales, /FETCH NEXT/u);
});
