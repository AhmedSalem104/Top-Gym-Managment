'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../src/services/member-service.js'), 'utf8');

test('production member creation uses a read-only schema gate instead of request-time DDL', () => {
    assert.match(source, /async function assertMemberMutationSchemaReady/);
    assert.match(source, /OBJECT_ID\(N'dbo\.members', N'U'\)/);
    assert.match(source, /MEMBER_SCHEMA_NOT_READY/);
    assert.match(source, /prepareMemberMutationSchema\(\{ paymentRequired: amountPaid > 0 \}\)/);

    const createStart = source.indexOf('async function createMember(');
    const updateStart = source.indexOf('async function updateMember(', createStart);
    assert.ok(createStart >= 0 && updateStart > createStart, 'createMember must remain discoverable');
    const createBody = source.slice(createStart, updateStart);
    assert.doesNotMatch(createBody, /ensureMemberIdentityFields\(\);/);
    assert.doesNotMatch(createBody, /ensurePaymentTransactionsTable\(\);/);
    assert.doesNotMatch(createBody, /ensureMembershipCodeStorage\(\);/);
});
