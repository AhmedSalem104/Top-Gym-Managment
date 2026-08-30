'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const membershipCodeService = require('../../src/services/membership-code-service');
const attendanceService = require('../../src/services/attendance-service');
const { createMembershipPortalRateLimit, createMemoryRateLimitStore } = require('../../src/middleware/rate-limit.middleware');

const root = path.resolve(__dirname, '../..');
const membershipCodeServiceSource = fs.readFileSync(path.join(root, 'src/services/membership-code-service.js'), 'utf8');
const portalServiceSource = fs.readFileSync(path.join(root, 'src/services/member-portal-service.js'), 'utf8');
const attendanceServiceSource = fs.readFileSync(path.join(root, 'src/services/attendance-service.js'), 'utf8');
const feedbackServiceSource = fs.readFileSync(path.join(root, 'src/services/member-feedback-service.js'), 'utf8');
const portalUiSource = fs.readFileSync(path.join(root, 'public/js/member-portal.js'), 'utf8');
const portalHtmlSource = fs.readFileSync(path.join(root, 'public/member-portal.html'), 'utf8');
const brandingUiSource = fs.readFileSync(path.join(root, 'public/js/branding.js'), 'utf8');
const portalRoutesSource = fs.readFileSync(path.join(root, 'src/routes/member-portal.routes.js'), 'utf8');
const authMiddlewareSource = fs.readFileSync(path.join(root, 'src/middleware/auth.middleware.js'), 'utf8');

test('member portal links can be pinned to a tenant without exposing the membership code', () => {
    assert.equal(
        membershipCodeService.getPortalUrl('https://logicfit.example', 'Power-Gym'),
        'https://logicfit.example/member-portal?tenant=power-gym'
    );
    assert.doesNotMatch(membershipCodeService.getPortalUrl('https://logicfit.example', 'power gym'), /power%20gym/);
    assert.doesNotMatch(membershipCodeService.getPortalUrl('https://logicfit.example', 'power-gym'), /TG-|membershipCode/i);
});

test('portal reads are scoped to the member-code tenant before returning report data', () => {
    assert.match(portalServiceSource, /findMemberContextByCode\(code, \{ request \}\)/);
    assert.match(portalServiceSource, /runTenantContext\(\{ tenantId: memberContext\.tenantId, mode: 'public'/);
    assert.match(portalServiceSource, /tenant:\s*\{\s*name: memberContext\.tenantName/);
    assert.match(feedbackServiceSource, /findMemberContextByCode\(membershipCode, \{ request \}\)/);
    assert.match(feedbackServiceSource, /runTenantContext\(\{ tenantId: memberContext\.tenantId, mode: 'public'/);
});

test('membership-code reads stay read-only and audit writes carry the active tenant explicitly', () => {
    assert.match(membershipCodeServiceSource, /ensureMembershipCodeStorage\(\{ readOnly: true \}\)/);
    assert.match(membershipCodeServiceSource, /currentTenantId\(\{ required: true \}\)/);
    assert.match(membershipCodeServiceSource, /tenant_id = @tenantId AND id IN/);
    assert.match(membershipCodeServiceSource, /INSERT INTO dbo\.gym_membership_code_audit \(tenant_id, member_id, action/);
});

test('member portal UI keeps one member record and each ledger row isolated on small screens', () => {
    assert.match(portalUiSource, /portal-membership-overview/);
    assert.match(portalUiSource, /portal-membership-history/);
    assert.match(portalUiSource, /data-label="\$\{escapeHtml\(label\)\}/);
    assert.match(portalUiSource, /resetOnFailure: true/);
});

test('public portal starts with platform branding and switches safely to the resolved gym branding', () => {
    assert.match(portalHtmlSource, /<body class="member-portal-page" data-branding-entry="saas">/);
    assert.match(portalUiSource, /await applyPortalTenant\(data\.tenant\)/);
    assert.match(portalUiSource, /scope: 'platform'/);
    assert.match(portalUiSource, /applyTenantBrandingFallback/);
    assert.match(brandingUiSource, /let refreshSequence = 0/);
});

test('occupancy levels use explicit, ordered thresholds', () => {
    const thresholds = { moderateAt: 3, busyAt: 6, veryBusyAt: 10 };
    assert.deepEqual(attendanceService.getOccupancyLevel(0, thresholds), { level: 'quiet', label: 'هادئ' });
    assert.deepEqual(attendanceService.getOccupancyLevel(3, thresholds), { level: 'moderate', label: 'متوسط' });
    assert.deepEqual(attendanceService.getOccupancyLevel(6, thresholds), { level: 'busy', label: 'مزدحم' });
    assert.deepEqual(attendanceService.getOccupancyLevel(10, thresholds), { level: 'very_busy', label: 'مزدحم جدًا' });
});

test('member portal occupancy is a tenant-scoped read-only aggregate', () => {
    const occupancyStart = attendanceServiceSource.indexOf('async function getCurrentOccupancy');
    const occupancyEnd = attendanceServiceSource.indexOf('async function getAttendanceRecordForDate', occupancyStart);
    const occupancyFunction = attendanceServiceSource.slice(occupancyStart, occupancyEnd);
    assert.ok(occupancyStart >= 0);
    assert.match(occupancyFunction, /ensureAttendanceTable\(\{ readOnly: true \}\)/);
    assert.match(occupancyFunction, /currentTenantId\(\{ required: true \}\)/);
    assert.match(occupancyFunction, /m\.tenant_id = @tenantId/);
    assert.match(occupancyFunction, /a\.check_out_at IS NULL/);
    assert.match(occupancyFunction, /@autoMinutes/);
    assert.match(occupancyFunction, /COUNT\(DISTINCT CASE/);
    assert.doesNotMatch(occupancyFunction, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i);
    assert.match(portalServiceSource, /findMemberContextByCode\(code, \{ request, auditAction: null \}\)/);
    assert.match(portalServiceSource, /runTenantContext\(\{ tenantId: memberContext\.tenantId, mode: 'public'/);
    assert.match(portalServiceSource, /attendanceService\.getCurrentOccupancy\(\)/);
    assert.match(portalRoutesSource, /app\.post\('\/api\/member-portal\/occupancy'/);
    assert.match(authMiddlewareSource, /'\/member-portal\/occupancy'/);
});

test('occupancy portal UI polls without retaining or displaying member identities', () => {
    assert.match(portalHtmlSource, /id="portalOccupancyCard"/);
    assert.match(portalHtmlSource, /id="portalOccupancyCount"/);
    assert.match(portalHtmlSource, /id="portalOccupancyStatus"/);
    assert.match(portalUiSource, /fetch\('\/api\/member-portal\/occupancy'/);
    assert.match(portalUiSource, /scheduleOccupancyRefresh/);
    assert.match(portalUiSource, /document\.hidden/);
    assert.match(portalUiSource, /staleCheckInsExcluded/);
    assert.doesNotMatch(portalUiSource, /fullName.*occupancy|memberName.*occupancy/i);
});

test('occupancy polling uses a separate rate-limit bucket from code lookup', async () => {
    const store = createMemoryRateLimitStore();
    const limiter = createMembershipPortalRateLimit({
        store,
        fallbackStore: store,
        ipMax: 100,
        occupancyIpMax: 100,
        codeMax: 1,
        occupancyCodeMax: 2
    });
    const createResponse = () => ({
        statusCode: 200,
        body: null,
        headers: {},
        set(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    });
    const request = {
        method: 'POST',
        path: '/occupancy',
        originalUrl: '/api/member-portal/occupancy',
        body: { membershipCode: 'TG-TEST-CODE' },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' }
    };
    let nextCalls = 0;
    await limiter(request, createResponse(), () => { nextCalls += 1; });
    await limiter(request, createResponse(), () => { nextCalls += 1; });
    const blockedResponse = createResponse();
    await limiter(request, blockedResponse, () => { nextCalls += 1; });
    assert.equal(nextCalls, 2);
    assert.equal(blockedResponse.statusCode, 429);
});
