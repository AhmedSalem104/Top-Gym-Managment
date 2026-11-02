'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('interactive check-in and check-out reconcile only the identified member', () => {
    const service = read('src/services/attendance-service.js');
    const checkIn = service.slice(service.indexOf('async function checkIn('), service.indexOf('async function checkOut('));
    const checkOut = service.slice(service.indexOf('async function checkOut('), service.indexOf('async function getMemberAttendance('));

    for (const operation of [checkIn, checkOut]) {
        assert.match(operation, /const resolved = await findMember\(/);
        assert.match(operation, /await reconcileAutoCheckout\(pool, resolved\.member\.id\)/);
        assert.doesNotMatch(operation, /await reconcileAutoCheckout\(pool\);/);
    }
});

test('automatic checkout updates in attendance reads are explicitly tenant-scoped', () => {
    const service = read('src/services/attendance-service.js');
    const today = service.slice(service.indexOf('async function getTodayAttendance('), service.indexOf('/**\n * Read-only occupancy snapshot'));
    const memberStatuses = service.slice(service.indexOf('async function getMemberAttendanceStatuses('), service.indexOf('async function resolveQrMember('));

    for (const reader of [today, memberStatuses]) {
        assert.match(reader, /currentTenantId\(\{ required: true \}\)/);
        assert.match(reader, /INNER JOIN dbo\.members AS member[\s\S]{0,140}member\.tenant_id = @tenantId/);
    }
});

test('confirmed attendance writes update the current list snapshot before using the fallback refresh', () => {
    const page = read('public/js/pages/attendance/attendance.js');
    assert.match(page, /function applyConfirmedAttendanceRecord\(record\)/);
    assert.match(page, /const updatedInPlace = applyConfirmedAttendanceRecord\(result\.attendance\);/);
    assert.match(page, /if \(!updatedInPlace\) void loadAttendance\(\{ force: true \}\);/);
});
