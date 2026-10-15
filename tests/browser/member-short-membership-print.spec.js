'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const memberId = 42421;
const memberName = '\u0639\u0636\u0648 \u0627\u062e\u062a\u0628\u0627\u0631 \u0627\u0644\u0628\u0637\u0627\u0642\u0629';
const gymName = '\u0646\u0627\u062f\u064a \u0627\u062e\u062a\u0628\u0627\u0631 \u0627\u0644\u0637\u0628\u0627\u0639\u0629';
const fixtureMember = {
    id: memberId,
    fullName: memberName,
    phone: '01012345678',
    phoneCountry: 'EG',
    email: 'qa.member@example.test',
    registrationDate: '2026-10-01',
    membershipCode: { maskedCode: 'LF-QA-******' },
    membershipCodePortalUrl: 'https://portal.example.test/qa-member',
    membership: {
        id: 52101,
        status: 'active',
        plan: 'gym_only',
        type: 'monthly',
        startDate: '2026-10-01',
        effectiveEndDate: '2026-10-31',
        daysRemaining: 20,
        amountDue: 350,
        amountPaid: 350,
        amountRemaining: 0,
        paidAt: '2026-10-01',
        paymentMethod: 'cash',
        scope: { branches: [{ name: 'QA Branch' }], sections: [{ name: 'QA Gym' }] }
    }
};

test('member row print action produces the short Arabic membership document and a one-page PDF', async ({ page }) => {

    const apiCalls = [];
    const writeRequests = [];
    const printCss = fs.readFileSync(path.join(__dirname, '../../public/css/print.css'), 'utf8');

    await page.context().addInitScript(() => {
        window.print = () => { window.__qaPrintCalled = true; };
    });

    await page.context().route('**/css/print.css*', async (route) => route.fulfill({
        status: 200,
        contentType: 'text/css; charset=utf-8',
        body: printCss
    }));

    await page.context().route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        const method = request.method();
        apiCalls.push({ method, pathname });

        if (method !== 'GET' && method !== 'HEAD') {
            writeRequests.push({ method, pathname });
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only browser fixture' }) });
        }

        let payload = {};
        if (pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 99421, name: 'QA Synthetic Owner', role: 'Owner', tenantType: 'gym', permissions: ['*'] } };
        } else if (pathname === '/api/saas/entitlements') {
            payload = {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'qa', name: 'QA Synthetic' } },
                entitlements: {
                    tenantType: 'gym',
                    features: { dashboard: true, members: true },
                    featureCatalog: [{ key: 'dashboard', tenantTypes: ['gym'] }, { key: 'members', tenantTypes: ['gym'] }]
                }
            };
        } else if (pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: gymName } }, version: 1 };
        } else if (pathname === '/api/bootstrap') {
            payload = { branches: [], sections: [], defaultBranch: null };
        } else if (pathname === '/api/pricing') {
            payload = {
                plans: { gym_only: { label: '\u062c\u064a\u0645 \u0641\u0642\u0637', monthlyPrice: 350, sortOrder: 1, active: true } },
                types: { monthly: { label: '\u0634\u0647\u0631\u064a\u0629', durationValue: 1, mode: 'months', priceMultiplier: 1, sortOrder: 1, active: true } },
                prices: { gym_only: { monthly: 350 } }
            };
        } else if (pathname === '/api/members') {
            payload = { members: [fixtureMember], pagination: { page: 1, pageSize: 5, totalItems: 1, totalPages: 1 } };
        } else if (pathname === `/api/members/${memberId}/details`) {
            payload = { member: fixtureMember, currentMembership: fixtureMember.membership, memberships: [fixtureMember.membership], freezes: [], events: [], payments: [], financialSummary: {} };
        }

        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    await page.goto('/index.html#members', { waitUntil: 'networkidle' });
    await expect(page.locator('#membersSection')).toBeVisible();
    // The existing members view renders table rows on desktop and semantic
    // member cards on mobile. Exercise the same action through either surface.
    const memberRow = page.locator(`#membersList tr[data-member-id="${memberId}"], #membersList .members-mobile-card[data-member-id="${memberId}"]`).first();
    await expect(memberRow).toBeVisible();

    await memberRow.locator('[data-menu-toggle]').click();
    const printAction = memberRow.locator('.action-menu-panel [data-action="print"]');
    await expect(printAction).toBeVisible();

    const popupPromise = page.waitForEvent('popup');
    await printAction.click();
    const popup = await popupPromise;
    await expect(popup.locator('.print-sheet')).toBeVisible();
    await expect(popup.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(popup.locator('.print-brand-title')).toHaveText(gymName);
    await expect(popup.locator('.print-member-copy h2')).toHaveText(memberName);
    await expect(popup.locator('.print-info-grid').nth(1)).toContainText('LF-QA-******');
    await expect(popup.locator('.print-member-full')).toHaveCount(0);
    await expect(popup.locator('.print-table')).toHaveCount(0);

    const pageLayout = await popup.locator('.print-sheet').evaluate((sheet) => {
        const bounds = sheet.getBoundingClientRect();
        const nodes = [...sheet.querySelectorAll('h1, h2, p, span, strong, footer, .print-info-item, .print-billing-item')];
        const outside = nodes.filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1);
        }).map((node) => node.className || node.tagName.toLowerCase());
        return {
            direction: getComputedStyle(sheet).direction,
            sectionCount: sheet.querySelectorAll('.print-section').length,
            informationItems: sheet.querySelectorAll('.print-info-item').length,
            outside,
            width: Math.round(bounds.width),
            height: Math.round(bounds.height),
            scrollWidth: sheet.scrollWidth,
            clientWidth: sheet.clientWidth
        };
    });
    expect(pageLayout.direction).toBe('rtl');
    expect(pageLayout.sectionCount).toBe(3);
    expect(pageLayout.informationItems).toBeGreaterThanOrEqual(10);
    expect(pageLayout.outside).toEqual([]);
    expect(pageLayout.scrollWidth).toBeLessThanOrEqual(pageLayout.clientWidth + 1);

    await popup.waitForFunction(() => window.__qaPrintCalled === true);
    await popup.addStyleTag({ content: printCss });
    await popup.evaluate(() => Promise.race([
        document.fonts?.ready || Promise.resolve(),
        new Promise((resolve) => window.setTimeout(resolve, 2500))
    ]));

    const markup = await popup.content();
    const printable = await page.context().newPage();
    await printable.setContent(markup, { waitUntil: 'domcontentloaded' });
    await printable.addStyleTag({ content: printCss });
    await printable.emulateMedia({ media: 'print' });
    await printable.evaluate(() => Promise.race([
        document.fonts?.ready || Promise.resolve(),
        new Promise((resolve) => window.setTimeout(resolve, 2500))
    ]));

    const evidenceDirectory = path.resolve(__dirname, '../../qa/artifacts/member-short-membership-print-final');
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, 'member-short-membership-print.png');
    const pdfPath = path.join(evidenceDirectory, 'member-short-membership-print.pdf');
    await printable.screenshot({ path: screenshotPath, fullPage: true });
    const pdf = await printable.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.byteLength).toBeGreaterThan(5000);
    const pdfPages = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
    expect(pdfPages).toBe(1);
    const exportOverflow = await printable.locator('.print-sheet').evaluate((sheet) => [...sheet.querySelectorAll('.print-info-item strong')].flatMap((value) => {
        const range = document.createRange();
        range.selectNodeContents(value);
        const text = range.getBoundingClientRect();
        const item = value.closest('.print-info-item').getBoundingClientRect();
        return text.left < item.left - 1 || text.right > item.right + 1 ? [value.textContent.trim()] : [];
    }));
    expect(apiCalls.filter((entry) => entry.pathname === `/api/members/${memberId}/details` && entry.method === 'GET')).toHaveLength(1);
    expect(writeRequests).toEqual([]);
    expect(exportOverflow).toEqual([]);

    await printable.close();
    await popup.close();
});
