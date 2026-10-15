'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const printCss = fs.readFileSync(path.resolve(__dirname, '../../public/css/print.css'), 'utf8');
const evidenceDirectory = path.resolve(__dirname, '../../qa/artifacts/print-batch-focused');

const membershipDocument = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>إيصال الاشتراك</title></head>
<body><main class="print-sheet">
  <header class="print-header"><h1 class="print-brand-title">نادي اختبار الطباعة</h1><div class="print-document-meta"><strong>إيصال الاشتراك</strong><span>رقم العضو: #42421</span></div></header>
  <section class="print-section"><div class="print-section-title"><h2>بيانات المشترك</h2></div>
    <div class="print-member-hero"><span class="print-member-avatar">عا</span><div class="print-member-copy"><h2>عضو اختبار الطباعة</h2><p>01012345678 · qa.member@example.test</p></div></div>
    <div class="print-info-grid"><div class="print-info-item"><span>رقم العضو</span><strong>#42421</strong></div><div class="print-info-item"><span>تاريخ التسجيل</span><strong>١ أكتوبر ٢٠٢٦</strong></div><div class="print-info-item"><span>البريد الإلكتروني</span><strong dir="ltr">qa.member@example.test</strong></div><div class="print-info-item"><span>ملاحظات العضو</span><strong>لا توجد</strong></div></div>
  </section>
  <section class="print-section"><div class="print-section-title"><h2>تفاصيل الوصول</h2></div><div class="print-info-grid"><div class="print-info-item"><span>الفرع</span><strong>QA Branch</strong></div><div class="print-info-item"><span>القسم</span><strong>QA Gym</strong></div><div class="print-info-item"><span>كود بوابة العضوية</span><strong>LF-QA-******</strong></div><div class="print-info-item"><span>رابط بوابة العضوية</span><strong dir="ltr">https://portal.example.test/qa-member</strong></div></div></section>
  <section class="print-section"><div class="print-section-title"><h2>الاشتراك الحالي</h2></div><div class="print-info-grid"><div class="print-info-item"><span>الباقة</span><strong>جيم فقط</strong></div><div class="print-info-item"><span>نوع العضوية</span><strong>شهرية</strong></div><div class="print-info-item"><span>تاريخ البداية</span><strong>١ أكتوبر ٢٠٢٦</strong></div><div class="print-info-item"><span>تاريخ الانتهاء</span><strong>٣١ أكتوبر ٢٠٢٦</strong></div></div><div class="print-billing-grid"><div class="print-billing-item"><span>المستحق</span><strong>٣٥٠ ج.م</strong></div><div class="print-billing-item"><span>المتبقي</span><strong>٠ ج.م</strong></div></div></section>
  <footer class="print-footer">Logic Fit</footer>
</main></body></html>`;

const storeReceiptDocument = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>إيصال مبيعات</title></head>
<body><main class="print-sheet"><header class="print-header"><h1 class="print-brand-title">النادي الاختباري</h1><div class="print-document-meta"><strong>إيصال مبيعات: QA-2026-0091</strong></div></header>
<section class="print-section"><div class="print-section-title"><h2>تفاصيل الإيصال</h2></div><div class="print-table-wrap"><table class="print-table"><thead><tr><th>المنتج</th><th>الكمية</th><th>الإجمالي</th></tr></thead><tbody><tr><td>زجاجة ماء طويلة الاسم للاختبار</td><td>2</td><td>١٧٥٫٠٠ ج.م</td></tr></tbody></table></div><div class="print-receipt-amount"><span>الإجمالي</span><strong>١٧٥٫٠٠ ج.م</strong></div></section><footer class="print-footer">شكرًا لزيارتكم</footer></main></body></html>`;

test('focused A4 print batch keeps membership details readable and the receipt within the sheet', async ({ page }) => {
    await fs.promises.mkdir(evidenceDirectory, { recursive: true });

    for (const [name, markup, hasMemberGrid] of [
        ['membership-subscription', membershipDocument, true],
        ['store-receipt', storeReceiptDocument, false]
    ]) {
        await page.setViewportSize({ width: 794, height: 1123 });
        await page.setContent(markup, { waitUntil: 'load' });
        await page.addStyleTag({ content: printCss });
        await page.emulateMedia({ media: 'print' });
        await page.evaluate(() => document.fonts?.ready);

        const geometry = await page.evaluate(() => {
            const sheet = document.querySelector('.print-sheet');
            const bounds = sheet.getBoundingClientRect();
            const grid = sheet.querySelector('.print-info-grid');
            const gridColumns = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : null;
            const overflowing = [...sheet.querySelectorAll('h1,h2,p,span,strong,th,td,.print-info-item,.print-billing-item,.print-receipt-amount')]
                .filter((node) => {
                    const rect = node.getBoundingClientRect();
                    return rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1);
                }).map((node) => node.className || node.tagName.toLowerCase());
            return { direction: getComputedStyle(sheet).direction, gridColumns, overflowing };
        });
        expect(geometry.direction).toBe('rtl');
        expect(geometry.overflowing).toEqual([]);
        if (hasMemberGrid) expect(geometry.gridColumns).toBe(2);

        const pngPath = path.join(evidenceDirectory, `${name}-a4-preview.png`);
        const pdfPath = path.join(evidenceDirectory, `${name}-a4.pdf`);
        await page.screenshot({ path: pngPath, fullPage: true });
        const pdf = await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
        expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
        const pages = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
        expect(pages).toBe(1);
        expect(pdf.toString('latin1')).toContain('/MediaBox');

        await fs.promises.writeFile(path.join(evidenceDirectory, `${name}-audit.json`), JSON.stringify({
            source: 'Browser-rendered focused fixture using canonical public/css/print.css; existing application print routes separately exercised in member-short-membership-print and store-sale-receipt-print.',
            language: 'ar',
            direction: geometry.direction,
            requestedPaper: 'A4 portrait',
            pageCount: pages,
            membershipInfoGridColumns: hasMemberGrid ? geometry.gridColumns : null,
            overflow: geometry.overflowing,
            preview: pngPath,
            pdf: pdfPath
        }, null, 2), 'utf8');
    }
});
