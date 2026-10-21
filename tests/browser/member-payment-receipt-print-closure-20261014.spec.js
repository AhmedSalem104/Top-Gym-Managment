'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const memberId = 42421;
const paymentId = 942101;
const memberName = '\u0639\u0636\u0648 \u0627\u062e\u062a\u0628\u0627\u0631 \u0625\u064a\u0635\u0627\u0644 \u0627\u0644\u062f\u0641\u0639';
const artifactDirectory = path.resolve(__dirname, '../../qa/artifacts/member-payment-receipt-print-closure-20261014');

const membership = {
    id: 52101,
    status: 'active',
    plan: 'gym_only',
    type: 'monthly',
    startDate: '2026-10-01',
    effectiveEndDate: '2026-10-31',
    amountDue: 1250,
    amountPaid: 900,
    amountRemaining: 350,
    freezes: [],
    scope: { branches: [{ name: 'QA Main Branch' }], sections: [{ name: 'QA Gym' }] }
};

const payment = {
    id: paymentId,
    memberId,
    membershipId: membership.id,
    receiptNumber: 'LF-QA-RECEIPT-942101',
    transactionType: 'payment',
    transactionDate: '2026-10-12T10:30:00.000Z',
    createdAt: '2026-10-12T10:30:00.000Z',
    paidAt: '2026-10-12',
    plan: 'gym_only',
    type: 'monthly',
    paymentMethod: 'cash',
    amountDue: 1250,
    amountPaid: 900,
    amountRemaining: 350,
    notes: 'Synthetic print QA payment; no real customer data.'
};

const member = {
    id: memberId,
    fullName: memberName,
    phone: '01012345678',
    phoneCountry: 'EG',
    email: 'print.qa@example.test',
    registrationDate: '2026-10-01',
    membership: { ...membership }
};

test('member details payment action produces a bounded RTL receipt PDF without writes', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    test.skip(testInfo.project.name !== 'desktop', 'Actual PDF layout is verified once in Chromium desktop.');

    const requests = [];
    const writes = [];
    await page.context().route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        requests.push({ method, pathname: url.pathname });

        if (url.origin !== 'http://127.0.0.1:4173') return route.abort();
        if (url.pathname.startsWith('/api/')) {
            if (method !== 'GET' && method !== 'HEAD') {
                writes.push({ method, pathname: url.pathname });
                return route.fulfill({
                    status: 405,
                    contentType: 'application/json; charset=utf-8',
                    body: JSON.stringify({ error: 'Read-only synthetic print fixture' })
                });
            }

            let payload = {};
            if (url.pathname === '/api/auth/session') {
                payload = { authenticated: true, user: { id: 99421, name: 'Synthetic QA Owner', role: 'Owner', tenantType: 'gym', permissions: ['*'] } };
            } else if (url.pathname === '/api/saas/entitlements') {
                payload = {
                    tenantStatus: 'active',
                    subscription: { status: 'active', plan: { code: 'qa', name: 'Synthetic QA' } },
                    entitlements: {
                        tenantType: 'gym',
                        features: { dashboard: true, members: true },
                        featureCatalog: [{ key: 'dashboard', tenantTypes: ['gym'] }, { key: 'members', tenantTypes: ['gym'] }]
                    }
                };
            } else if (url.pathname === '/api/branding') {
                payload = { branding: { identity: { brandName: 'Synthetic QA Gym' }, assets: {} }, version: 1 };
            } else if (url.pathname === '/api/bootstrap') {
                payload = { branches: [], sections: [], defaultBranch: null };
            } else if (url.pathname === '/api/pricing') {
                payload = {
                    plans: { gym_only: { label: '\u062c\u064a\u0645 \u0641\u0642\u0637', monthlyPrice: 1250, sortOrder: 1, active: true } },
                    types: { monthly: { label: '\u0634\u0647\u0631\u064a\u0629', durationValue: 1, mode: 'months', priceMultiplier: 1, sortOrder: 1, active: true } },
                    prices: { gym_only: { monthly: 1250 } }
                };
            } else if (url.pathname === '/api/members') {
                payload = { members: [member], pagination: { page: 1, pageSize: 5, totalItems: 1, totalPages: 1 } };
            } else if (url.pathname === `/api/members/${memberId}/details`) {
                payload = {
                    member,
                    currentMembership: membership,
                    memberships: [membership],
                    freezes: [],
                    events: [],
                    payments: [payment],
                    financialSummary: { totalDue: 1250, totalPaid: 900, totalRemaining: 350, paidTransactionCount: 1 }
                };
            }

            return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
        }

        if (method !== 'GET' && method !== 'HEAD') {
            writes.push({ method, pathname: url.pathname });
            return route.abort();
        }
        return route.continue();
    });

    await page.context().addInitScript(() => {
        window.print = () => { window.__qaPrintCalled = true; };
    });

    await page.goto('/index.html#members', { waitUntil: 'networkidle' });
    if (!await page.evaluate(() => Boolean(window.topGymPrint?.printPaymentReceipt))) {
        await page.addScriptTag({ url: '/js/integrations/print-enhancements.js' });
    }
    await expect.poll(() => page.evaluate(() => Boolean(window.topGymPrint?.printPaymentReceipt))).toBe(true);

    const row = page.locator(`#membersList tr[data-member-id="${memberId}"], #membersList .members-mobile-card[data-member-id="${memberId}"]`).first();
    await expect(row).toBeVisible();
    await row.locator('button[data-action="details"]').click();

    const details = page.locator('#detailsDialog');
    await expect(details).toBeVisible();
    await details.locator('#memberDetailsTab-account').click();
    await expect(details.locator('.payment-history-table')).toContainText('LF-QA-RECEIPT-942101');
    const receiptButton = details.locator(`[data-payment-receipt][data-payment-id="${paymentId}"]`);
    await expect(receiptButton).toBeVisible();

    const popupPromise = page.waitForEvent('popup');
    await receiptButton.click();
    const receipt = await popupPromise;
    await expect(receipt.locator('.print-sheet')).toBeVisible();
    await expect(receipt.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(receipt.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(receipt.locator('.print-document-meta')).toContainText('LF-QA-RECEIPT-942101');
    await expect(receipt.locator('.print-member-copy')).toContainText(memberName);
    const normalizedAmountText = await receipt.locator('.print-receipt-amount').innerText().then((value) => value
        .replace(/[\u0660-\u0669]/g, (digit) => String('\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'.indexOf(digit)))
        .replace(/[\u06f0-\u06f9]/g, (digit) => String('\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9'.indexOf(digit))));
    expect(normalizedAmountText).toContain('900');
    expect(normalizedAmountText).toContain('350');
    await expect(receipt.locator('.print-notes')).toContainText('Synthetic print QA payment');
    await receipt.waitForFunction(() => window.__qaPrintCalled === true);

    const printCss = await fs.readFile(path.resolve(__dirname, '../../public/css/print.css'), 'utf8');
    await receipt.addStyleTag({ content: printCss });
    await receipt.emulateMedia({ media: 'print' });
    await receipt.evaluate(() => Promise.race([document.fonts?.ready || Promise.resolve(), new Promise((resolve) => setTimeout(resolve, 2500))]));
    const layout = await receipt.locator('.print-sheet').evaluate((sheet) => {
        const bounds = sheet.getBoundingClientRect();
        const textNodes = [...sheet.querySelectorAll('h1,h2,p,span,strong,small,footer,.print-info-item')];
        const outside = textNodes.filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1);
        }).map((node) => node.className || node.tagName.toLowerCase());
        const ltrValues = [...sheet.querySelectorAll('[dir="ltr"]')].map((node) => ({ text: node.textContent.trim(), direction: getComputedStyle(node).direction }));
        return {
            direction: getComputedStyle(sheet).direction,
            sheetWidth: Math.round(bounds.width),
            sheetHeight: Math.round(bounds.height),
            scrollWidth: sheet.scrollWidth,
            clientWidth: sheet.clientWidth,
            outside,
            text: sheet.innerText,
            ltrValues
        };
    });
    expect(layout.direction).toBe('rtl');
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.outside).toEqual([]);
    if (layout.ltrValues.length) expect(layout.ltrValues.every((entry) => entry.direction === 'ltr')).toBe(true);
    expect(layout.text).toContain(memberName);
    expect(layout.text).toContain('LF-QA-RECEIPT-942101');
    expect(layout.text).toContain('Synthetic print QA payment');

    await fs.mkdir(artifactDirectory, { recursive: true });
    const previewPath = path.join(artifactDirectory, 'member-payment-receipt-ar-rtl-preview.png');
    const pdfPath = path.join(artifactDirectory, 'member-payment-receipt-ar-rtl.pdf');
    const printable = await page.context().newPage();
    await printable.setViewportSize({ width: 794, height: 1123 });
    await printable.setContent(await receipt.content(), { waitUntil: 'domcontentloaded' });
    await printable.addStyleTag({ content: printCss });
    await printable.emulateMedia({ media: 'print' });
    await printable.evaluate(() => Promise.race([document.fonts?.ready || Promise.resolve(), new Promise((resolve) => setTimeout(resolve, 2500))]));
    await printable.screenshot({ path: previewPath, fullPage: true, timeout: 15000 });
    const pdf = await printable.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.byteLength).toBeGreaterThan(3000);
    const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    expect(pageCount).toBe(1);
    const mediaBox = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    expect(mediaBox, 'PDF page must expose A4-sized page bounds.').not.toBeNull();
    const pageSizePoints = { width: Number(mediaBox[1]), height: Number(mediaBox[2]) };
    expect(pageSizePoints.width).toBeGreaterThan(590);
    expect(pageSizePoints.width).toBeLessThan(600);
    expect(pageSizePoints.height).toBeGreaterThan(835);
    expect(pageSizePoints.height).toBeLessThan(850);

    expect(writes).toEqual([]);
    expect(requests.filter((request) => request.pathname === `/api/members/${memberId}/details` && request.method === 'GET').length).toBeGreaterThanOrEqual(2);
    await fs.writeFile(path.join(artifactDirectory, 'audit.json'), JSON.stringify({
        flow: 'Members row → details → financial history → print payment receipt → actual popup print document → Chromium PDF',
        source: 'Synthetic fixtures intercepted in Playwright; every non-GET request blocked; no production/customer data used.',
        coverageGap: 'No existing browser test directly exercised printPaymentReceipt from the member financial-history action.',
        locale: { htmlLang: 'ar', htmlDir: 'rtl', documentDirection: layout.direction, ltrValues: layout.ltrValues },
        page: { requested: 'A4 portrait', pageCount, mediaBoxPoints: pageSizePoints, pdfBytes: pdf.byteLength },
        layout: { width: layout.sheetWidth, height: layout.sheetHeight, scrollWidth: layout.scrollWidth, clientWidth: layout.clientWidth, outside: layout.outside },
        assertions: {
            memberName: true, receiptNumber: true, paidAmount: true, remainingAmount: true,
            notes: true, rtl: true, noOutOfBoundsText: true,
            ltrIsolation: layout.ltrValues.length ? 'verified for fields marked dir=ltr' : 'not applicable: this receipt template emits no dir=ltr field'
        },
        api: requests.filter((request) => request.pathname.startsWith('/api/')),
        blockedWrites: writes,
        artifacts: { previewPath, pdfPath }
    }, null, 2), 'utf8');

    await printable.close();
    await receipt.close();
});
