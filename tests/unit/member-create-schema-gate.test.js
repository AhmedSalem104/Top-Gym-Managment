'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../src/services/member-service.js'), 'utf8');
const browserSource = fs.readFileSync(path.join(__dirname, '../../public/js/app.js'), 'utf8');
const pageSource = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');

test('production member creation uses a read-only schema gate instead of request-time DDL', () => {
    assert.match(source, /async function assertMemberMutationSchemaReady/);
    assert.match(source, /OBJECT_ID\(N'dbo\.members', N'U'\)/);
    assert.match(source, /MEMBER_SCHEMA_NOT_READY/);
    assert.match(source, /membershipRequired: membershipRequested/);
    assert.match(source, /paymentRequired: membershipRequested && amountPaid > 0/);
    assert.match(source, /if \(membershipRequested\) \{/);
    assert.match(source, /if \(!membershipRequested && paymentDetailsProvided\)/);

    const createStart = source.indexOf('async function createMember(');
    const updateStart = source.indexOf('async function updateMember(', createStart);
    assert.ok(createStart >= 0 && updateStart > createStart, 'createMember must remain discoverable');
    const createBody = source.slice(createStart, updateStart);
    assert.doesNotMatch(createBody, /ensureMemberIdentityFields\(\);/);
    assert.doesNotMatch(createBody, /ensurePaymentTransactionsTable\(\);/);
    assert.doesNotMatch(createBody, /ensureMembershipCodeStorage\(\);/);
    assert.doesNotMatch(createBody, /CREATE TABLE|ALTER TABLE|DROP TABLE|CREATE INDEX/u);
    assert.match(source, /FROM dbo\.members WITH \(UPDLOCK, HOLDLOCK\)/);
});

test('the browser keeps membership and payment opt-in fields in the member registration form', () => {
    assert.match(browserSource, /const shouldCreateMembership = isNewMember && Boolean\(\$\('createMembership'\)\?\.checked\)/u);
    assert.match(browserSource, /body\.createMembership = shouldCreateMembership/u);
    assert.match(browserSource, /if \(paymentAllowed && \(shouldCreateMembership/u);
    assert.match(browserSource, /const body = \{[\s\S]*?fullName: \$\('fullName'\)\.value,[\s\S]*?phone: \$\('phone'\)\.value,[\s\S]*?notes: \$\('notes'\)\.value/u);
    assert.doesNotMatch(pageSource, /class="checkbox-field member-membership-toggle" hidden/u);
    assert.doesNotMatch(pageSource, /class="checkbox-field whatsapp-after-save" hidden/u);
    assert.doesNotMatch(pageSource, /id="membershipType"[^>]*required/u);
    assert.doesNotMatch(pageSource, /id="membershipPlan"[^>]*required/u);
    assert.doesNotMatch(pageSource, /id="startDate"[^>]*required/u);
    assert.doesNotMatch(pageSource, /id="endDate"[^>]*required/u);
});
