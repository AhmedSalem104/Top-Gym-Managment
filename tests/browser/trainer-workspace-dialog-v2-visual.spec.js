'use strict';

const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const trainerHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'trainer-workspace.html'), 'utf8');

async function installReadOnlyTrainerFixture(page) {
    const writes = [];
    await page.route('**/trainer-workspace/**', async (route) => {
        if (route.request().resourceType() === 'document') {
            return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: trainerHtml });
        }
        return route.continue();
    });

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (!['GET', 'HEAD'].includes(request.method())) {
            writes.push(`${request.method()} ${url.pathname}`);
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'read_only_fixture' }) });
        }

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 9201, name: 'مدرب الاختبار', role: 'Owner', tenantType: 'independent_trainer', mustChangePassword: false } };
        } else if (url.pathname === '/api/saas/entitlements') {
            const features = ['clients', 'coaching', 'nutrition', 'library', 'assessments', 'progress', 'goals', 'sessions', 'packages', 'payments', 'reports', 'portal', 'notifications', 'tasks', 'templates'];
            payload = {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'basic', name: 'Basic' } },
                entitlements: {
                    tenantType: 'independent_trainer',
                    features: Object.fromEntries(features.map((feature) => [feature, true])),
                    featureCatalog: features.map((key) => ({ key, tenantTypes: ['independent_trainer'] }))
                }
            };
        } else if (url.pathname === '/api/saas/subscription') {
            payload = { tenant: { name: 'مساحة المدرب التجريبية' }, subscription: { status: 'active', plan: { name: 'Trainer' } } };
        } else if (url.pathname === '/api/trainer/workspace') {
            payload = { metrics: { activeClients: 3, sessionsToday: 2, upcomingSessions: 4, packagesExpiring: 1, outstandingPayments: 850, clientsNeedingFollowUp: 1, recentMeasurements: 2, recentCheckins: 1 } };
        } else if (url.pathname === '/api/trainer/clients') {
            payload = { clients: [], pagination: { page: 1, totalPages: 1, total: 0 } };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });
    return writes;
}

test('Trainer long-form dialog stays contained and scrollable at V2 viewports/themes in RTL', async ({ page }) => {
    test.setTimeout(180_000);
    const writes = await installReadOnlyTrainerFixture(page);
    const evidenceDirectory = path.resolve(process.cwd(), 'qa/artifacts/trainer-workspace-dialog-v2-visual');
    await fsPromises.mkdir(evidenceDirectory, { recursive: true });
    await page.goto('/trainer-workspace/dashboard', { waitUntil: 'networkidle' });

    const dialog = page.locator('#trainerMeasurementDialog');
    await expect(dialog).toBeAttached();
    const form = dialog.locator('#trainerMeasurementForm');
    const widths = [320, 390, 768, 1440];

    for (const width of widths) {
        await page.setViewportSize({ width, height: width <= 390 ? 760 : 900 });
        for (const theme of ['light', 'dark']) {
            await page.evaluate((value) => window.TopGymTheme.set(value), theme);
            await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
            await dialog.evaluate((element) => element.showModal());

            const geometry = await dialog.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                const formElement = element.querySelector('form');
                const formRect = formElement.getBoundingClientRect();
                const gridRect = formElement.querySelector('.trainer-form-grid').getBoundingClientRect();
                const actionsRect = formElement.querySelector('.trainer-dialog-actions').getBoundingClientRect();
                return {
                    viewportWidth: document.documentElement.clientWidth,
                    viewportHeight: document.documentElement.clientHeight,
                    pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
                    left: rect.left,
                    right: rect.right,
                    top: rect.top,
                    bottom: rect.bottom,
                    width: rect.width,
                    formLeft: formRect.left,
                    formRight: formRect.right,
                    formClientHeight: formElement.clientHeight,
                    formScrollHeight: formElement.scrollHeight,
                    gridBottom: gridRect.bottom,
                    actionsTop: actionsRect.top,
                    direction: document.documentElement.dir,
                    theme: document.documentElement.dataset.theme
                };
            });

            const label = `${width}px ${theme} RTL: ${JSON.stringify(geometry)}`;
            expect(geometry.theme, label).toBe(theme);
            expect(geometry.direction, label).toBe('rtl');
            expect(geometry.pageWidth, label).toBeLessThanOrEqual(width + 1);
            expect(geometry.left, label).toBeGreaterThanOrEqual(-1);
            expect(geometry.right, label).toBeLessThanOrEqual(width + 1);
            expect(geometry.top, label).toBeGreaterThanOrEqual(-1);
            expect(geometry.bottom, label).toBeLessThanOrEqual(geometry.viewportHeight + 1);
            expect(geometry.width, label).toBeLessThanOrEqual(width - 1);
            expect(geometry.formLeft, label).toBeGreaterThanOrEqual(geometry.left);
            expect(geometry.formRight, label).toBeLessThanOrEqual(geometry.right);
            expect(geometry.actionsTop, label).toBeGreaterThanOrEqual(geometry.gridBottom - 1);

            if (width <= 390) {
                expect(geometry.formScrollHeight, label).toBeGreaterThan(geometry.formClientHeight);
                await form.evaluate((element) => { element.scrollTop = element.scrollHeight; });
                const finalControls = await dialog.evaluate((element) => {
                    const note = element.querySelector('#trainerMeasurementNotes').getBoundingClientRect();
                    const actions = element.querySelector('.trainer-dialog-actions').getBoundingClientRect();
                    const formBounds = element.querySelector('form').getBoundingClientRect();
                    return { noteBottom: note.bottom, actionsTop: actions.top, actionsBottom: actions.bottom, formBottom: formBounds.bottom };
                });
                expect(finalControls.noteBottom, `${label} final note must precede actions`).toBeLessThanOrEqual(finalControls.actionsTop + 1);
                expect(finalControls.actionsBottom, `${label} actions must remain within the scroll region`).toBeLessThanOrEqual(finalControls.formBottom + 1);
                await expect(dialog.locator('#trainerMeasurementSave')).toBeInViewport();
                await form.evaluate((element) => { element.scrollTop = 0; });
            }

            await page.screenshot({ path: path.join(evidenceDirectory, `measurement-dialog-${width}-${theme}-rtl.png`), fullPage: false });
            await dialog.evaluate((element) => element.close());
        }
    }

    expect(writes, 'visual dialog QA must not perform live or fixture writes').toEqual([]);
});
