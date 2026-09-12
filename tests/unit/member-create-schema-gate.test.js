'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../src/services/member-service.js'), 'utf8');
const browserSource = fs.readFileSync(path.join(__dirname, '../../public/js/app.js'), 'utf8');
const pageSource = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
const controllerSource = fs.readFileSync(path.join(__dirname, '../../src/controllers/members.controller.js'), 'utf8');
const branchContextSource = fs.readFileSync(path.join(__dirname, '../../public/js/branch-context.js'), 'utf8');

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

test('new memberships initialize branch and mixed-section visibility inside the transaction', () => {
    assert.match(source, /async function assignDefaultMembershipScope\(transaction, membershipId, \{ branchId = null, sectionId = null, actorUserId = null, actorRole = null \} = \{\}\)/u);
    assert.match(source, /FROM dbo\.gym_branches[\s\S]*?status='active'[\s\S]*?ORDER BY is_main_branch DESC/u);
    assert.match(source, /requestedBranchId/);
    assert.match(source, /requestedSectionId/);
    assert.match(source, /gym_branch_user_access/);
    assert.match(source, /actorUserId/);
    assert.match(source, /MEMBERSHIP_BRANCH_INVALID/);
    assert.match(source, /MEMBERSHIP_SECTION_INVALID/);
    assert.match(source, /INSERT INTO dbo\.gym_membership_branch_access/u);
    assert.match(source, /section_type='mixed'/u);
    assert.match(source, /INSERT INTO dbo\.gym_membership_section_access/u);

    const createStart = source.indexOf('async function createMember(');
    const updateStart = source.indexOf('async function updateMember(', createStart);
    const createBody = source.slice(createStart, updateStart);
    assert.match(createBody, /await assignDefaultMembershipScope\(transaction, membershipId, \{ branchId, sectionId, actorUserId, actorRole \}\);/u);
    assert.match(controllerSource, /branchId: request\.body\?\.branchId/);
    assert.match(controllerSource, /sectionId: request\.body\?\.sectionId/);
    assert.match(controllerSource, /actorUserId: request\.auth\?\.id/);
});

test('the browser always submits initial membership fields for new members', () => {
    assert.match(browserSource, /if \(isNewMember\) \{[\s\S]*?body\.createMembership = true;[\s\S]*?body\.membershipType = \$\('membershipType'\)\.value;[\s\S]*?body\.membershipPlan = \$\('membershipPlan'\)\.value;/u);
    assert.match(browserSource, /body\.branchId = \$\('memberBranchId'\)\.value \|\| null;/u);
    assert.match(browserSource, /body\.sectionId = \$\('memberSectionId'\)/u);
    assert.match(browserSource, /async function syncMemberScopeOptions/u);
    assert.match(browserSource, /window\.topGymBranchContext\?\.getBootstrap/);
    assert.match(browserSource, /if \(paymentAllowed && \(isNewMember/u);
    assert.match(browserSource, /const body = \{[\s\S]*?fullName: \$\('fullName'\)\.value,[\s\S]*?\.\.\.phonePayload,[\s\S]*?notes: \$\('notes'\)\.value/u);
    assert.doesNotMatch(pageSource, /createMembership|member-membership-toggle/u);
    assert.doesNotMatch(pageSource, /class="checkbox-field whatsapp-after-save" hidden/u);
    assert.doesNotMatch(pageSource, /id="membershipType"[^>]*required/u);
    assert.doesNotMatch(pageSource, /id="membershipPlan"[^>]*required/u);
    assert.doesNotMatch(pageSource, /id="startDate"[^>]*required/u);
    assert.doesNotMatch(pageSource, /id="endDate"[^>]*required/u);
    assert.match(pageSource, /id="memberBranchId"/u);
    assert.match(pageSource, /id="memberSectionId"/u);
    assert.match(branchContextSource, /window\.topGymBranchContext = Object\.freeze/u);
});
