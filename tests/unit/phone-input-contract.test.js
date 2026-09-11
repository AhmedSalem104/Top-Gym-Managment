'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('phone input layer is loaded by every page that owns a phone form', () => {
    assert.match(read('public/index.html'), /core\/phone-inputs\.js/);
    assert.match(read('public/register-gym.html'), /core\/phone-inputs\.js/);
    assert.match(read('public/register-trainer.html'), /core\/phone-inputs\.js/);
    assert.match(read('public/trainer-workspace.html'), /core\/phone-inputs\.js/);
    const script = read('public/js/core/phone-inputs.js');
    assert.match(script, /\/api\/phone\/countries/);
    assert.match(script, /data-phone-country/);
    assert.match(script, /normalizeForTransport/);
});

test('phone-bearing screens use tel inputs without changing numeric business fields', () => {
    const index = read('public/index.html');
    assert.match(index, /id="phone" type="tel"[^>]*data-phone-input/);
    assert.match(index, /id="attendancePhone" type="tel"[^>]*data-phone-input/);
    assert.match(index, /id="dayPassVisitorPhone" type="tel"[^>]*data-phone-input/);
    assert.match(index, /id="storeSupplierPhone" type="tel"[^>]*data-phone-input/);
    assert.match(index, /id="externalPhone" type="tel"[^>]*data-phone-input/);
    assert.match(read('public/js/branch-context.js'), /id="branchPhoneInput"[^>]*type="tel"[^>]*data-phone-input/);
    assert.match(read('public/js/pages/coaching/coaching.js'), /id="coachingEditPhone"[^>]*type="tel"[^>]*data-phone-input/);
    assert.match(read('public/js/trainer-workspace.js'), /phoneCountry/);
    assert.match(index, /id="amountPaid"[^>]*type="number"/);
});

test('phone writes use centralized normalization and tenant-scoped duplicate checks', () => {
    const member = read('src/services/member-service.js');
    const coaching = read('src/services/coaching-service.js');
    const attendance = read('src/services/attendance-service.js');
    const registration = read('src/services/gym-registration-service.js');
    assert.match(member, /normalizeInternationalPhone\(output\.phone/);
    assert.match(member, /WHERE tenant_id=@tenantId/);
    assert.match(member, /phoneNormalized/);
    assert.match(coaching, /normalizeInternationalPhone\(phone/);
    assert.match(coaching, /WHERE tenant_id=@tenantId/);
    assert.match(attendance, /tenant_id=@tenantId/);
    assert.match(registration, /normalizeMobile/);
});
