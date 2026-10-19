'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

test.use({ video: 'on' });

test('shared loading, member filter choices, detail tabs and mobile navigation remain composed', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Capture one deterministic end-to-end visual interaction recording with responsive mode changes.');
    test.setTimeout(90_000);

    const requests = [];
    const member = {
        id: 88201,
        fullName: 'Synthetic Interaction QA Member',
        phone: '+201001234567',
        phoneCountry: 'EG',
        registrationDate: '2026-09-01',
        membershipCode: { maskedCode: 'LF-88201-******' },
        membership: {
            id: 89201, plan: 'gym_only', type: 'monthly', status: 'active',
            startDate: '2026-09-01', effectiveEndDate: '2026-11-12', daysRemaining: 31,
            amountDue: 750, amountPaid: 600, amountRemaining: 150, freezeCount: 1, freezeLimit: 3, freezes: []
        },
        attendance: {}
    };
    const members = [member];
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        requests.push({ method: request.method(), path: url.pathname });
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method().toUpperCase())) {
            return route.fulfill({ status: 405, json: { error: 'Read-only browser fixture blocks writes.' } });
        }

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 88201, name: 'Synthetic Owner', role: 'Owner', tenantId: 88201, tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/branding') {
            payload = { identity: { brandName: 'Synthetic QA Gym' }, assets: {} };
        } else if (url.pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: 'Business' } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }), limits: {} } };
        } else if (url.pathname === '/api/branches/bootstrap') {
            const branch = { id: 1, name: 'Synthetic QA Branch', status: 'active', isMain: true };
            payload = { branch, branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [], hasMultipleActiveBranches: false, branchLimit: 5, canUseAllBranches: true };
        } else if (url.pathname === '/api/dashboard') {
            payload = { stats: { total: 1, active: 1, expiringSoon: 0, expired: 0, frozen: 0 }, alerts: [] };
        } else if (url.pathname === '/api/pricing') {
            payload = { plans: { gym_only: { label: 'Gym', monthlyPrice: 750, active: true } }, types: { monthly: { label: 'Monthly', active: true, mode: 'months', durationValue: 1 } }, durations: { monthly: 1 } };
        } else if (url.pathname === '/api/members') {
            // Simulated slow QA response captures the actual in-region loading state; no delay exists in application code.
            await new Promise((resolve) => setTimeout(resolve, 700));
            payload = { members, pagination: { page: 1, pageSize: 5, total: 1, totalItems: 1, totalPages: 1, hasPrevious: false, hasNext: false } };
        } else if (url.pathname === `/api/members/${member.id}/details`) {
            payload = { member, currentMembership: member.membership, memberships: [member.membership], freezes: [], events: [], payments: [] };
        } else if (url.pathname === `/api/clients/${member.id}/coaching-summary`) {
            payload = { workoutPrograms: [], dietPlans: [], measurementCount: 0, completedSessions: 0, mealLogCount: 0 };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    await page.addInitScript(() => {
        localStorage.setItem('logic-fit-ui-locale', 'ar');
        localStorage.setItem('topgym-theme', 'light');
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/index.html?interactionRecording=1#members', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#membersList .logicfit-loading-state')).toBeVisible();
    await expect(page.locator('#membersList')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#membersList .skeleton-table, #membersList .skeleton-list, #membersList .skeleton-cards')).toHaveCount(0);
    await expect(page.locator('.top-progress.is-visible')).toHaveCount(0);
    await expect(page.locator('#membersList')).toContainText('Synthetic Interaction QA Member', { timeout: 15_000 });

    const statusChoices = page.locator('[data-filter-choices-for="statusFilter"]');
    await statusChoices.locator('[role="radio"][data-filter-value="active"]').click();
    await expect(page.locator('#statusFilter')).toHaveValue('active');
    await expect(page.locator('#membersList .logicfit-refresh-indicator')).toBeVisible();
    await expect(page.locator('#membersList')).toContainText('Synthetic Interaction QA Member');
    await expect(page.locator('#membersList .logicfit-refresh-indicator')).toHaveCount(0, { timeout: 15_000 });

    let detailsAction = page.locator('#membersList [data-action="details"]:visible').first();
    if (!(await detailsAction.count())) {
        await page.locator('#membersList .action-menu-toggle:visible').first().click();
        detailsAction = page.locator('#membersList [data-action="details"]:visible').first();
    }
    await detailsAction.click();
    const dialog = page.locator('#detailsDialog');
    await expect(dialog).toBeVisible();
    const trainingTab = dialog.locator('[data-member-details-tab="training"]');
    await trainingTab.click();
    await expect(trainingTab).toHaveAttribute('aria-selected', 'true');
    await dialog.locator('[data-member-details-tab="overview"]').click();
    await expect(dialog.locator('[data-member-details-tab="overview"]')).toHaveAttribute('aria-selected', 'true');
    await page.screenshot({ path: testInfo.outputPath('details-overview-desktop.png') });
    await page.locator('#detailsClose').click();
    await expect(dialog).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileMenu = page.locator('#mobileNavToggle');
    await expect(mobileMenu).toBeVisible();
    await mobileMenu.click();
    await expect(page.locator('.app-shell')).toHaveClass(/mobile-nav-open/u);
    await page.screenshot({ path: testInfo.outputPath('mobile-navigation-open.png') });
    await page.keyboard.press('Escape');
    await expect(page.locator('.app-shell')).not.toHaveClass(/mobile-nav-open/u);

    expect(requests.every(({ method }) => ['GET', 'HEAD', 'OPTIONS'].includes(method))).toBe(true);
    const artifactDir = path.resolve(process.cwd(), 'qa/artifacts/shared-interaction-feedback');
    await fs.mkdir(artifactDir, { recursive: true });
    const video = page.video();
    await page.close();
    if (video) {
        const output = path.join(artifactDir, 'shared-interaction-flow.webm');
        await video.saveAs(output);
        await testInfo.attach('shared-interaction-flow', { path: output, contentType: 'video/webm' });
    }
    await fs.copyFile(testInfo.outputPath('details-overview-desktop.png'), path.join(artifactDir, 'details-overview-desktop.png'));
    await fs.copyFile(testInfo.outputPath('mobile-navigation-open.png'), path.join(artifactDir, 'mobile-navigation-open.png'));
});
