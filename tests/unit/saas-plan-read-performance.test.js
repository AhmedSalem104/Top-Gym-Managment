'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

test('plan catalog cold reads share one load and run independent enrichment queries concurrently', () => {
    const child = spawnSync(process.execPath, ['-e', String.raw`
        process.env.CACHE_ENABLED = 'false';
        process.env.CACHE_GATEWAY_URL = '';
        process.env.CACHE_GATEWAY_TOKEN = '';

        const path = require('node:path');
        const databasePath = require.resolve('./src/database');
        const database = require(databasePath);
        let baseQueries = 0;
        const enrichmentQueries = { features: 0, compatibility: 0, terms: 0 };
        let activeEnrichment = 0;
        let maximumActiveEnrichment = 0;
        let releaseEnrichment;
        const enrichmentGate = new Promise((resolve) => { releaseEnrichment = resolve; });
        const pool = {
            request() {
                return {
                    input() { return this; },
                    async query(statement) {
                        if (statement.includes('FROM dbo.saas_plans')) {
                            baseQueries += 1;
                            return { recordset: [{
                                id: 7, code: 'starter', name: 'Starter', billing_period: 'monthly',
                                price: 100, currency: 'EGP', max_members: 50, max_clients: null,
                                max_users: 2, max_ai_generations: null, max_storage_mb: 200,
                                max_branches: 1, features_json: '{}', is_active: true,
                                lifecycle_status: 'active', available_for_new_subscriptions: true,
                                sort_order: 1, updated_at: null
                            }] };
                        }
                        let kind;
                        if (statement.includes('FROM dbo.saas_plan_features')) kind = 'features';
                        else if (statement.includes('FROM dbo.saas_plan_tenant_types')) kind = 'compatibility';
                        else if (statement.includes('FROM dbo.saas_plan_terms')) kind = 'terms';
                        else throw new Error('Unexpected SQL in isolated plan-catalog test.');
                        enrichmentQueries[kind] += 1;
                        activeEnrichment += 1;
                        maximumActiveEnrichment = Math.max(maximumActiveEnrichment, activeEnrichment);
                        if (Object.values(enrichmentQueries).reduce((sum, count) => sum + count, 0) === 3) releaseEnrichment();
                        await enrichmentGate;
                        activeEnrichment -= 1;
                        if (kind === 'compatibility') return { recordset: [{ plan_id: 7, tenant_type: 'gym' }] };
                        if (kind === 'terms') return { recordset: [{
                            id: 21, plan_id: 7, term_code: 'monthly', duration_months: 1,
                            price: 100, currency: 'EGP', discount_amount: 0,
                            discount_percent: 0, is_active: true, sort_order: 1
                        }] };
                        return { recordset: [{ plan_id: 7, feature_key: 'members', is_enabled: true }] };
                    }
                };
            }
        };
        require.cache[databasePath].exports = { ...database, getPool: async () => pool };

        const saasService = require('./src/services/saas-service');
        let watchdog;
        const watchdogPromise = new Promise((_, reject) => {
            watchdog = setTimeout(() => reject(new Error('Plan catalog queries did not complete.')), 2500);
            watchdog.unref();
        });
        Promise.race([
            Promise.all([saasService.getPlans({ readOnly: true }), saasService.getPlans({ readOnly: true })]),
            watchdogPromise
        ]).then(([first, second]) => {
            if (baseQueries !== 1) throw new Error('Concurrent catalog reads duplicated the base query.');
            if (Object.values(enrichmentQueries).some((count) => count !== 1)) throw new Error('Enrichment query count was not one per projection.');
            if (maximumActiveEnrichment !== 3) throw new Error('Independent enrichment reads did not overlap.');
            if (first[0]?.id !== 7 || second[0]?.id !== 7) throw new Error('Plan results changed.');
            if (first[0]?.compatibleTenantTypes?.[0] !== 'gym' || first[0]?.terms?.[0]?.id !== 21) throw new Error('Plan enrichment mapping changed.');
        }).catch((error) => {
            process.stderr.write(error.stack || String(error));
            process.exitCode = 1;
        }).finally(() => clearTimeout(watchdog));
    `], {
        cwd: process.cwd(),
        env: { ...process.env, CACHE_ENABLED: 'false', CACHE_GATEWAY_URL: '', CACHE_GATEWAY_TOKEN: '' },
        encoding: 'utf8',
        timeout: 5000
    });

    assert.equal(child.status, 0, child.stderr || child.stdout || 'Isolated plan-catalog test failed.');
});
