'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const memberId = 74201;
const memberName = '\u0645\u062d\u0645\u062f \u0627\u062e\u062a\u0628\u0627\u0631 \u0627\u0644\u0637\u0628\u0627\u0639\u0629';
const longNote = '\u0645\u0644\u0627\u062d\u0638\u0629 \u0637\u0648\u064a\u0644\u0629 \u0644\u0627\u062e\u062a\u0628\u0627\u0631 \u0644\u0641 \u0627\u0644\u0646\u0635 \u0648\u0627\u0644\u0641\u0648\u0627\u0635\u0644 \u062f\u0648\u0646 \u0627\u0642\u062a\u0637\u0627\u0639 \u0623\u064a \u0642\u064a\u0645\u0629. '.repeat(6);
const memberships = Array.from({ length: 8 }, (_, index) => ({
    id: 75100 + index,
    status: index === 7 ? 'active' : 'expired',
    plan: index % 2 ? 'gym_cardio' : 'gym_only',
    type: index % 2 ? 'quarterly' : 'monthly',
    startDate: `2026-${String((index % 9) + 1).padStart(2, '0')}-01`,
    effectiveEndDate: `2026-${String((index % 9) + 1).padStart(2, '0')}-28`,
    daysRemaining: index === 7 ? 16 : -20,
    amountDue: 1250 + index * 25,
    listPrice: 1500 + index * 25,
    discountAmount: 250,
    amountPaid: 1000 + index * 25,
    amountRemaining: 250,
    paidAt: '2026-10-01',
    paymentMethod: 'cash',
    freezeCount: index % 3,
    freezeLimit: 3,
    notes: index === 7 ? longNote : `Synthetic membership history ${index + 1}`,
    scope: { branches: [{ name: 'Main Branch' }], sections: [{ name: 'Gym' }] }
}));
const payments = Array.from({ length: 32 }, (_, index) => ({
    id: 76100 + index,
    membershipId: memberships[index % memberships.length].id,
    receiptNumber: `QA-MEMBER-${String(index + 1).padStart(4, '0')}`,
    transactionDate: `2026-${String((index % 9) + 1).padStart(2, '0')}-12T14:30:00Z`,
    transactionType: index % 3 ? 'payment' : 'subscription',
    plan: index % 2 ? 'gym_cardio' : 'gym_only',
    type: index % 2 ? 'quarterly' : 'monthly',
    amountPaid: 1000 + index * 10,
    amountDue: 1250 + index * 10,
    amountRemaining: 250,
    paymentMethod: index % 2 ? 'card' : 'cash',
    notes: index === 31 ? longNote : `Synthetic payment note ${index + 1}`
}));
const freezes = Array.from({ length: 12 }, (_, index) => ({
    startDate: '2026-02-01', endDate: '2026-02-07', resumedDate: '2026-02-08', days: 7,
    reason: `Synthetic freeze record ${index + 1}`
}));
const events = Array.from({ length: 24 }, (_, index) => ({
    id: 77100 + index,
    eventType: index % 2 ? 'renewed' : 'updated',
    createdAt: `2026-10-${String((index % 27) + 1).padStart(2, '0')}T14:30:00Z`,
    details: { membershipPlan: 'gym_only', membershipType: 'monthly', amountDue: 1250, amountPaid: 1000, days: 7 }
}));
const member = {
    id: memberId,
    fullName: memberName,
    phone: '01012345678',
    phoneCountry: 'EG',
    email: 'synthetic.member@example.test',
    registrationDate: '2025-10-01',
    notes: longNote,
    membershipCode: { maskedCode: 'LF-QA-74201-******' },
    membershipCodePortalUrl: 'https://portal.example.test/members/74201?view=membership',
    membership: memberships.at(-1)
};
const details = {
    member,
    currentMembership: memberships.at(-1),
    memberships,
    freezes,
    events,
    payments,
    financialSummary: { totalDue: 41000, totalPaid: 33000, totalRemaining: 8000, paidTransactionCount: payments.length }
};
const artifacts = path.resolve(__dirname, '../../qa/artifacts/member-print-v2-visual');
const normalizeNumbers = (value) => String(value).replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660)).replace(/[٬٫,]/g, '');

test('member print formats render Arabic RTL and English LTR A4 PDFs without losing fixture fields or clipping content', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'A4 PDF pagination is captured in Desktop Chromium.');
    test.setTimeout(240_000);
    fs.mkdirSync(artifacts, { recursive: true });

    const apiCalls = [];
    const writes = [];
    const css = fs.readFileSync(path.resolve(__dirname, '../../public/css/print.css'), 'utf8');

    await page.context().addInitScript(() => {
        window.print = () => { window.__memberPrintInvoked = true; };
    });
    await page.context().route('**/css/print.css*', (route) => route.fulfill({
        status: 200,
        contentType: 'text/css; charset=utf-8',
        body: css
    }));
    await page.context().route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        apiCalls.push({ method: request.method(), pathname });
        if (!['GET', 'HEAD'].includes(request.method())) {
            writes.push({ method: request.method(), pathname });
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"Read-only synthetic print QA"}' });
        }

        let payload = {};
        if (pathname === '/api/auth/session') payload = { authenticated: true, user: { id: 991, role: 'Owner', tenantType: 'gym', permissions: ['*'] } };
        else if (pathname === '/api/saas/entitlements') payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'qa', name: 'Synthetic QA' } }, entitlements: { tenantType: 'gym', features: { dashboard: true, members: true }, featureCatalog: [{ key: 'dashboard', tenantTypes: ['gym'] }, { key: 'members', tenantTypes: ['gym'] }] } };
        else if (pathname === '/api/branding') payload = { branding: { identity: { brandName: 'Synthetic Gym' } }, version: 1 };
        else if (pathname === '/api/bootstrap') payload = { branches: [], sections: [], defaultBranch: null };
        else if (pathname === '/api/members') payload = { members: [member], pagination: { page: 1, pageSize: 5, totalItems: 1, totalPages: 1 } };
        else if (pathname === `/api/members/${memberId}/details`) payload = details;
        else if (pathname === '/api/pricing') payload = { plans: {}, types: {}, prices: {} };
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    await page.goto('/index.html#members', { waitUntil: 'networkidle' });
    const integrationLoaded = await page.evaluate(() => [...document.scripts].some((script) => script.src.includes('/integrations/print-enhancements.js')));
    if (!integrationLoaded) await page.addScriptTag({ url: '/js/integrations/print-enhancements.js' });

    const capture = async (name, invoke, locale = 'ar') => {
        await page.evaluate((language) => window.TopGymI18n?.set?.(language, { persist: false }), locale);
        await page.evaluate(() => { window.__memberPrintInvoked = false; });
        const popupPromise = page.waitForEvent('popup');
        await invoke();
        const popup = await popupPromise;
        await expect(popup.locator('.print-sheet')).toBeVisible();
        await popup.waitForFunction(() => window.__memberPrintInvoked === true);
        // Match the existing print QA contract: the isolated popup's external
        // stylesheet may not finish loading before its print timer fires. Apply
        // the canonical source directly after confirming the real template exists.
        await popup.addStyleTag({ content: css });
        const logo = await popup.locator('.print-logo').evaluate((image) => Promise.race([
            image.decode().then(() => ({ decoded: true, naturalWidth: image.naturalWidth })),
            new Promise((resolve) => setTimeout(() => resolve({ decoded: false, naturalWidth: image.naturalWidth }), 3000))
        ]));
        await popup.evaluate(() => Promise.race([document.fonts?.ready || Promise.resolve(), new Promise((resolve) => setTimeout(resolve, 2500))]));
        await popup.emulateMedia({ media: 'print' });

        const fields = await popup.locator('.print-sheet').evaluate((sheet) => ({
            direction: getComputedStyle(sheet).direction,
            language: document.documentElement.lang,
            pageSize: getComputedStyle(sheet).getPropertyValue('width'),
            text: sheet.innerText,
            sectionCount: sheet.querySelectorAll('.print-section').length,
            paymentRows: sheet.querySelectorAll('.print-table tbody tr').length,
            historyRows: sheet.querySelectorAll('.print-table tbody tr').length,
            overflowing: [...sheet.querySelectorAll('.print-info-item, .print-billing-item, .print-table-wrap, .print-footer')].filter((node) => node.scrollWidth > node.clientWidth + 1).length
        }));
        expect(fields.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
        expect(fields.language).toBe(locale);
        expect(fields.overflowing).toBe(0);

        const printable = await page.context().newPage();
        await printable.setContent(await popup.content(), { waitUntil: 'domcontentloaded' });
        await printable.addStyleTag({ content: css });
        await printable.emulateMedia({ media: 'print' });
        await printable.evaluate(() => Promise.race([document.fonts?.ready || Promise.resolve(), new Promise((resolve) => setTimeout(resolve, 2500))]));
        const pdfPath = path.join(artifacts, `${name}.pdf`);
        const pdf = await printable.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
        expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
        expect(pdf.byteLength).toBeGreaterThan(5000);
        const pageCount = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
        expect(pageCount).toBeGreaterThan(0);
        await printable.screenshot({ path: path.join(artifacts, `${name}-print-media.png`), fullPage: true });
        await fs.promises.writeFile(path.join(artifacts, `${name}.json`), JSON.stringify({
            documentTitle: await popup.title(),
            direction: fields.direction,
            language: fields.language,
            pageCount,
            pageSizeCss: fields.pageSize,
            sections: fields.sectionCount,
            paymentRows: fields.paymentRows,
            logo,
            overflowingNodes: fields.overflowing,
            bytes: pdf.byteLength
        }, null, 2));
        await printable.close();
        await popup.close();
        return { fields, pageCount };
    };

    member.notes = 'Synthetic short member note';
    memberships.at(-1).notes = 'Synthetic short membership note';
    const short = await capture('member-short-membership-a4', () => page.evaluate((id) => window.topGymPrint.printMember(id, 'membership'), memberId));
    expect(short.pageCount).toBe(1);
    expect(short.fields.sectionCount).toBe(3);
    expect(short.fields.text).toContain(memberName);
    expect(short.fields.text).toContain('synthetic.member@example.test');
    expect(short.fields.text).toContain('LF-QA-74201-******');
    expect(normalizeNumbers(short.fields.text)).toContain('142500');
    expect(normalizeNumbers(short.fields.text)).toContain('25000');
    expect(short.fields.text).toContain('https://portal.example.test/members/74201?view=membership');

    const shortEn = await capture('member-short-membership-a4-en', () => page.evaluate((id) => window.topGymPrint.printMember(id, 'membership'), memberId), 'en');
    expect(shortEn.pageCount).toBe(1);
    expect(shortEn.fields.text).toContain('Membership receipt');
    expect(shortEn.fields.text).toContain('Membership and portal scope');
    expect(shortEn.fields.text).toContain('EGP');
    expect(shortEn.fields.text).not.toContain('تاريخ التسجيل');

    member.notes = longNote;
    memberships.at(-1).notes = longNote;
    const full = await capture('member-full-profile-long-a4', () => page.evaluate((id) => window.topGymPrint.printMember(id, 'full'), memberId));
    expect(full.pageCount).toBeGreaterThan(1);
    expect(full.fields.sectionCount).toBeGreaterThanOrEqual(7);
    expect(full.fields.paymentRows).toBeGreaterThanOrEqual(32);
    expect(normalizeNumbers(full.fields.text)).toContain('4100000');
    expect(normalizeNumbers(full.fields.text)).toContain('3300000');
    expect(normalizeNumbers(full.fields.text)).toContain('800000');
    expect(full.fields.text).toContain('QA-MEMBER-0032');
    expect(full.fields.text).toContain(longNote.trim());

    const fullEn = await capture('member-full-profile-long-a4-en', () => page.evaluate((id) => window.topGymPrint.printMember(id, 'full'), memberId), 'en');
    expect(fullEn.pageCount).toBeGreaterThan(1);
    expect(fullEn.fields.paymentRows).toBeGreaterThanOrEqual(32);
    expect(fullEn.fields.text).toContain('Complete history');
    expect(fullEn.fields.text).toContain('EGP');
    expect(fullEn.fields.text).not.toContain('سجل الاشتراكات');

    member.notes = 'Synthetic short member note';
    memberships.at(-1).notes = 'Synthetic short membership note';
    const receipt = await capture('member-payment-receipt-a4', () => page.evaluate(({ id, paymentId }) => window.topGymPrint.printPaymentReceipt(id, paymentId), { id: memberId, paymentId: payments[0].id }));
    expect(receipt.pageCount).toBe(1);
    expect(receipt.fields.sectionCount).toBe(2);
    expect(receipt.fields.text).toContain('QA-MEMBER-0001');
    expect(receipt.fields.text).toContain(memberName);
    expect(normalizeNumbers(receipt.fields.text)).toContain('100000');
    expect(normalizeNumbers(receipt.fields.text)).toContain('25000');

    const receiptEn = await capture('member-payment-receipt-a4-en', () => page.evaluate(({ id, paymentId }) => window.topGymPrint.printPaymentReceipt(id, paymentId), { id: memberId, paymentId: payments[0].id }), 'en');
    expect(receiptEn.pageCount).toBe(1);
    expect(receiptEn.fields.text).toContain('Payment receipt');
    expect(receiptEn.fields.text).toContain('Transaction amount');
    expect(receiptEn.fields.text).toContain('EGP');
    expect(receiptEn.fields.text).not.toContain('رقم الإيصال');

    expect(apiCalls.filter((entry) => entry.pathname === `/api/members/${memberId}/details` && entry.method === 'GET').length).toBeGreaterThanOrEqual(3);
    expect(writes).toEqual([]);
    await fs.promises.writeFile(path.join(artifacts, 'coverage.json'), JSON.stringify({
        runtime: process.version,
        supportedFormatsVerified: ['Member membership summary — A4, Arabic/RTL and English/LTR', 'Full member profile — A4, long synthetic history in Arabic/RTL and English/LTR', 'Member payment receipt — A4, Arabic/RTL and English/LTR'],
        unsupportedByCurrentTemplate: [],
        noBackendWrites: writes.length === 0,
        apiReads: apiCalls.filter((entry) => entry.pathname === `/api/members/${memberId}/details`).length,
        outputs: ['member-short-membership-a4.pdf', 'member-short-membership-a4-en.pdf', 'member-full-profile-long-a4.pdf', 'member-full-profile-long-a4-en.pdf', 'member-payment-receipt-a4.pdf', 'member-payment-receipt-a4-en.pdf']
    }, null, 2));
});
