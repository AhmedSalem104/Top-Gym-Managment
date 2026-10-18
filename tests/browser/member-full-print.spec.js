'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const qaFeatures = ['dashboard', 'members', 'attendance', 'pricing', 'payments', 'reports', 'portal', 'notifications', 'coaching', 'nutrition', 'library', 'branding', 'team'];

const memberId = 4242;
const memberships = Array.from({ length: 5 }, (_, index) => ({
    id: 5000 + index,
    status: index ? 'expired' : 'active',
    plan: 'gym_only',
    type: 'monthly',
    startDate: '2025-10-01',
    effectiveEndDate: '2025-10-31',
    amountDue: 350,
    amountPaid: 350,
    amountRemaining: 0,
    paidAt: '2025-10-01',
    scope: { branches: [{ name: 'Main Branch' }], sections: [{ name: 'Gym' }] }
}));
const payments = Array.from({ length: 18 }, (_, index) => ({
    id: 9000 + index,
    receiptNumber: `LF-${String(2000 + index)}`,
    transactionDate: `2025-10-${String((index % 28) + 1).padStart(2, '0')}T14:30:00Z`,
    transactionType: index % 3 === 0 ? 'payment' : 'subscription',
    plan: 'gym_only',
    type: 'monthly',
    amountPaid: 350,
    amountRemaining: 0,
    paymentMethod: 'cash',
    notes: 'QA print note'
}));
const events = Array.from({ length: 18 }, (_, index) => ({
    id: 7000 + index,
    eventType: index % 2 ? 'updated' : 'renewed',
    createdAt: '2025-10-01T14:30:00Z',
    details: { membershipPlan: 'gym_only', membershipType: 'monthly', amountPaid: 350 }
}));
const member = {
    id: memberId,
    fullName: 'عضو اختبار الطباعة',
    phone: '01012345678',
    phoneCountry: 'EG',
    email: 'qa.member@example.test',
    registrationDate: '2025-10-01',
    notes: 'ملاحظات اختبار طويلة لضمان التفاف النص دون اقتطاع البيانات في الملف المطبوع.',
    membershipCode: { maskedCode: 'LF-TEST-******' },
    membershipCodePortalUrl: 'https://portal.example.test/member',
    membership: memberships[0]
};

test('full member print opens the current profile document and exports its real template to PDF', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'PDF print rendering is verified in the Chromium desktop project.');

    await page.context().addInitScript(() => { window.print = () => { window.__topGymPrintCalled = true; }; });
    await page.context().route('**/css/print.css*', (route) => route.abort());
    await page.route('**/css/print.css*', async (route) => route.fulfill({
        status: 200,
        contentType: 'text/css; charset=utf-8',
        body: fs.readFileSync(path.join(__dirname, '../../public/css/print.css'), 'utf8')
    }));
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === `/api/members/${memberId}/details`) {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    member,
                    currentMembership: memberships[0],
                    memberships,
                    freezes: Array.from({ length: 3 }, (_, index) => ({ startDate: '2025-03-07', endDate: '2025-03-08', resumedDate: '2025-03-08', days: 2, reason: `QA freeze ${index + 1}` })),
                    events,
                    payments,
                    financialSummary: { totalDue: 6300, totalPaid: 6300, totalRemaining: 0, paidTransactionCount: payments.length }
                })
            });
        }
        let body = {};
        if (pathname === '/api/auth/session') body = { authenticated: true, user: { id: 1, role: 'Owner', tenantType: 'gym', permissions: [] } };
        else if (pathname === '/api/saas/entitlements') body = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'qa', name: 'QA Plan' } }, entitlements: { tenantType: 'gym', features: Object.fromEntries(qaFeatures.map((key) => [key, true])), featureCatalog: qaFeatures.map((key) => ({ key, tenantTypes: ['gym'] })) } };
        else if (pathname === '/api/branding') body = { identity: { brandName: 'QA Gym' } };
        else if (pathname === '/api/members') body = { members: [], pagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0 } };
        else if (pathname.includes('/pricing')) body = { plans: {}, types: {}, prices: {} };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    await page.goto('/index.html#members', { waitUntil: 'networkidle' });
    const hasPrintEnhancements = await page.evaluate(() => [...document.scripts].some((script) => script.src.includes('/integrations/print-enhancements.js')));
    if (!hasPrintEnhancements) await page.addScriptTag({ url: '/js/integrations/print-enhancements.js' });
    await page.evaluate((id) => {
        const dialog = document.getElementById('detailsDialog');
        if (!dialog) throw new Error('Member details dialog is absent from the real app surface.');
        dialog.dataset.memberId = String(id);
        dialog.showModal();
    }, memberId);

    const popupPromise = page.waitForEvent('popup');
    await page.locator('.print-details-button').click();
    const popup = await popupPromise;
    await expect(popup.locator('.print-sheet.print-member-full')).toBeVisible();
    await expect(popup.locator('link[data-top-gym-print-styles]')).toHaveAttribute('href', /\/css\/print\.css\?v=[a-f0-9]{16}$/);
    await popup.waitForFunction(() => window.__topGymPrintCalled === true);
    await expect(popup.locator('style[data-top-gym-print-styles-fallback]')).toHaveCount(1);
    await popup.addStyleTag({ content: fs.readFileSync(path.join(__dirname, '../../public/css/print.css'), 'utf8') });
    await popup.waitForTimeout(250);

    const layout = await popup.locator('.print-member-full').evaluate((sheet) => ({
        sections: sheet.querySelectorAll('.print-section').length,
        paymentRows: sheet.querySelectorAll('.print-table tbody tr').length,
        infoGridColumns: getComputedStyle(sheet.querySelector('.print-info-grid')).gridTemplateColumns,
        sectionBreak: getComputedStyle(sheet.querySelector('.print-section')).breakInside,
        tableFontSize: getComputedStyle(sheet.querySelector('.print-table')).fontSize,
        allHistoryHeadingsPresent: ['سجل المدفوعات والإيصالات', 'سجل الاشتراكات والتجديدات', 'عمليات التجميد', 'كل العمليات المسجلة'].every((text) => sheet.innerText.includes(text))
    }));
    expect(layout.sections).toBeGreaterThan(3);
    expect(layout.paymentRows).toBeGreaterThanOrEqual(18);
    expect(layout.infoGridColumns.split(' ').length).toBe(2);
    expect(layout.sectionBreak).toBe('auto');
    expect(Number.parseFloat(layout.tableFontSize)).toBeGreaterThanOrEqual(11);
    expect(layout.allHistoryHeadingsPresent).toBe(true);
    const outputPath = testInfo.outputPath('member-full-v2-preview.pdf');
    const printable = await page.context().newPage();
    const generatedMarkup = await popup.evaluate(() => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${document.querySelector('main.print-sheet').outerHTML}</body></html>`);
    await printable.setContent(generatedMarkup, { waitUntil: 'domcontentloaded' });
    await printable.addStyleTag({ content: fs.readFileSync(path.join(__dirname, '../../public/css/print.css'), 'utf8') });
    await printable.emulateMedia({ media: 'print' });
    const pdf = await printable.pdf({ path: outputPath, printBackground: true, preferCSSPageSize: true });
    expect(pdf.byteLength).toBeGreaterThan(10000);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    await printable.screenshot({ path: testInfo.outputPath('member-full-v2-preview-screen.png'), fullPage: true });
    await printable.close();
    await popup.close();

    const receiptPopupPromise = page.waitForEvent('popup');
    await page.evaluate(({ id, paymentId }) => window.topGymPrint.printPaymentReceipt(id, paymentId), { id: memberId, paymentId: payments[0].id });
    const receiptPopup = await receiptPopupPromise;
    await expect(receiptPopup.locator('.print-sheet')).toBeVisible();
    await expect(receiptPopup.locator('.print-document-meta')).toContainText(payments[0].receiptNumber);
    await expect(receiptPopup.locator('.print-member-copy h2')).toHaveText(member.fullName);
    await expect(receiptPopup.locator('.print-receipt-amount strong')).toContainText('٣٥٠');
    await receiptPopup.waitForFunction(() => window.__topGymPrintCalled === true);
    await receiptPopup.addStyleTag({ content: fs.readFileSync(path.join(__dirname, '../../public/css/print.css'), 'utf8') });
    const receiptAmountColor = await receiptPopup.locator('.print-receipt-amount strong').evaluate((element) => getComputedStyle(element).color);
    expect(receiptAmountColor).toBe('rgb(0, 112, 243)');

    const receiptLayout = await receiptPopup.locator('.print-sheet').evaluate((sheet) => ({
        direction: getComputedStyle(sheet).direction,
        scrollWidth: sheet.scrollWidth,
        clientWidth: sheet.clientWidth,
        sectionCount: sheet.querySelectorAll('.print-section').length,
        amountVisible: Boolean(sheet.querySelector('.print-receipt-amount strong')?.textContent.trim())
    }));
    expect(receiptLayout.direction).toBe('rtl');
    expect(receiptLayout.scrollWidth).toBeLessThanOrEqual(receiptLayout.clientWidth + 1);
    expect(receiptLayout.sectionCount).toBe(2);
    expect(receiptLayout.amountVisible).toBe(true);

    const receiptPrintable = await page.context().newPage();
    const receiptMarkup = await receiptPopup.evaluate(() => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${document.querySelector('main.print-sheet').outerHTML}</body></html>`);
    await receiptPrintable.setContent(receiptMarkup, { waitUntil: 'domcontentloaded' });
    await receiptPrintable.addStyleTag({ content: fs.readFileSync(path.join(__dirname, '../../public/css/print.css'), 'utf8') });
    await receiptPrintable.emulateMedia({ media: 'print' });
    const receiptPdf = await receiptPrintable.pdf({ path: testInfo.outputPath('member-payment-receipt-preview.pdf'), printBackground: true, preferCSSPageSize: true });
    expect(receiptPdf.byteLength).toBeGreaterThan(5000);
    expect(receiptPdf.subarray(0, 4).toString()).toBe('%PDF');
    await receiptPrintable.screenshot({ path: testInfo.outputPath('member-payment-receipt-preview.png'), fullPage: true });
    await receiptPrintable.close();
    await receiptPopup.close();
});
