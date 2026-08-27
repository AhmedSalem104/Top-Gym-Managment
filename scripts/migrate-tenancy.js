'use strict';

require('dotenv').config();

const { closePool, initDatabase } = require('../src/database');
const { runTenantContext } = require('../src/tenancy/tenant-context');
const tenantService = require('../src/services/tenant-service');
const authService = require('../src/services/auth-service');
const libraryService = require('../src/services/library-service');
const coachingService = require('../src/services/coaching-service');
const dayPassService = require('../src/services/day-pass-service');
const membershipCodeService = require('../src/services/membership-code-service');
const memberFeedbackService = require('../src/services/member-feedback-service');
const storeService = require('../src/services/store-service');
const intelligenceService = require('../src/services/intelligence-service');
const brandingService = require('../src/services/branding-service');
const saasService = require('../src/services/saas-service');

async function migrate() {
    await runTenantContext({ mode: 'platform', tenantId: 1 }, () => initDatabase());
    await runTenantContext({ mode: 'platform', tenantId: 1 }, () => tenantService.ensureTenantTables());
    const bootstrapTenant = await runTenantContext({ mode: 'platform', tenantId: 1 }, () => tenantService.ensureBootstrapTenant());
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => saasService.ensureSaasTables());
    await runTenantContext({ mode: 'tenant', tenantId: bootstrapTenant.id }, async () => {
        await authService.ensureAuthReady();
        await libraryService.ensureLibraryData();
        await coachingService.ensureCoachingTables();
        await dayPassService.ensureDayPassTables();
        await membershipCodeService.ensureMembershipCodeStorage();
        await memberFeedbackService.ensureMemberFeedbackTable();
        await storeService.ensureStoreTables();
        await intelligenceService.ensureIntelligenceTables();
        await brandingService.ensureBrandingTables();
    });
    const result = await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => tenantService.ensureTenantColumnsAndRls(bootstrapTenant.id));
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => saasService.ensureBootstrapSubscription(bootstrapTenant.id));
    console.log(JSON.stringify({ tenant: bootstrapTenant, tenantTables: result.tables.length, saasTables: saasService.SAAS_TABLES.length, policy: 'enabled' }));
}

migrate()
    .catch((error) => {
        console.error('Tenancy migration failed:', error.message);
        process.exitCode = 1;
    })
    .finally(() => closePool().catch(() => {}));
