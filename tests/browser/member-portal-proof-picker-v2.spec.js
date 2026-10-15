'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '../..');
const cssRoot = path.join(root, 'public/css');
const importPattern = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/g;

function expandCss(file, chain = []) {
    const absolute = path.resolve(file);
    if (chain.includes(absolute)) throw new Error(`Circular CSS import: ${absolute}`);
    const source = fs.readFileSync(absolute, 'utf8');
    return source.replace(importPattern, (_, importPath) => {
        if (/^(?:https?:|data:)/i.test(importPath)) return `@import url("${importPath}");`;
        const target = path.resolve(path.dirname(absolute), importPath);
        if (!target.startsWith(`${cssRoot}${path.sep}`)) throw new Error(`CSS import escaped the source root: ${importPath}`);
        return expandCss(target, [...chain, absolute]);
    });
}

const css = esbuild.transformSync(expandCss(path.join(cssRoot, 'main.source.css')), {
    loader: 'css', minify: true, legalComments: 'none'
}).code;

test('Member Portal proof picker is keyboard-visible and contained at V2 viewports/themes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'This isolated fixture iterates the full viewport and theme matrix itself.');

    await page.setContent(`<!doctype html>
      <html lang="ar" dir="rtl" data-theme="light">
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>
        <body class="member-portal-page">
          <main class="portal-shell">
            <section class="portal-result">
              <header class="portal-result-header"><div><p class="portal-eyebrow">Logic Fit</p><h2>بوابة العضوية</h2></div></header>
              <section id="portalSubscriptionSection" class="portal-subscription">
                <header class="portal-subscription-head"><div><span class="portal-section-kicker">MEMBERSHIP REQUEST</span><h3>اشترك أو جدد عضويتك</h3><p>اختر التفاصيل وأرفق إثبات الدفع لمراجعة الطلب.</p></div></header>
                <form class="portal-subscription-form">
                  <div class="portal-subscription-grid"><label>نوع الاشتراك<select><option>شهري</option></select></label><label>تاريخ التحصيل<input type="date"></label></div>
                  <section class="portal-payment-methods"><h4>بيانات التحويل للجيم</h4><p>اختر وسيلة الدفع المناسبة.</p></section>
                  <div class="portal-subscription-summary"><div><span>العضوية</span><strong>جيم فقط — عضوية شهرية</strong></div><div><span>المبلغ المطلوب</span><strong>١٬٢٠٠ ج.م</strong></div></div>
                  <label class="portal-proof-picker" for="portalProofFixture">
                    <span class="portal-proof-picker-icon" aria-hidden="true">↑</span>
                    <span><strong>إثبات الدفع</strong><small>اختر صورة أو ملف PDF — الحد الأقصى 4MB</small></span>
                    <input id="portalProofFixture" type="file" accept="image/*,application/pdf">
                  </label>
                  <label class="portal-subscription-notes">ملاحظة اختيارية<textarea rows="3"></textarea></label>
                  <div class="portal-subscription-actions"><button class="btn btn-primary" type="button">إرسال طلب التفعيل</button><span class="portal-subscription-note">سيتم اعتماد الاشتراك بعد مراجعة الإثبات.</span></div>
                </form>
              </section>
            </section>
          </main>
        </body>
      </html>`);

    const evidenceDir = path.join(root, 'qa/artifacts/member-portal-proof-picker-v2');
    await fsp.mkdir(evidenceDir, { recursive: true });

    for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: width < 500 ? 844 : 960 });
        for (const theme of ['light', 'dark']) {
            await page.locator('html').evaluate((html, value) => { html.dataset.theme = value; }, theme);
            await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

            const layout = await page.evaluate(() => {
                const picker = document.querySelector('.portal-proof-picker');
                const bounds = picker.getBoundingClientRect();
                return {
                    viewport: document.documentElement.clientWidth,
                    document: document.documentElement.scrollWidth,
                    pickerLeft: bounds.left,
                    pickerRight: bounds.right,
                    pickerWidth: bounds.width,
                    direction: getComputedStyle(document.body).direction,
                    theme: document.documentElement.dataset.theme
                };
            });
            expect(layout.document, `${width}px ${theme}: page must not overflow`).toBeLessThanOrEqual(layout.viewport + 1);
            expect(layout.direction).toBe('rtl');
            expect(layout.pickerLeft).toBeGreaterThanOrEqual(-1);
            expect(layout.pickerRight).toBeLessThanOrEqual(layout.viewport + 1);
            expect(layout.pickerWidth).toBeGreaterThan(0);

            const picker = page.locator('.portal-proof-picker');
            await page.locator('select').focus();
            const unfocusedState = await picker.evaluate((element) => {
                const style = getComputedStyle(element);
                return { borderColor: style.borderTopColor, boxShadow: style.boxShadow };
            });
            const proofInput = page.locator('#portalProofFixture');
            for (let tab = 0; tab < 8 && !(await proofInput.evaluate((input) => input === document.activeElement)); tab += 1) {
                await page.keyboard.press('Tab');
            }
            await expect(proofInput).toBeFocused();
            const focusState = await picker.evaluate((element) => {
                const style = getComputedStyle(element);
                return { borderColor: style.borderTopColor, boxShadow: style.boxShadow };
            });
            expect(focusState.borderColor, `${width}px ${theme}: focus border changes`).not.toBe(unfocusedState.borderColor);
            expect(focusState.boxShadow, `${width}px ${theme}: visible focus ring`).not.toBe('none');

            await page.screenshot({
                path: path.join(evidenceDir, `proof-picker-${width}-${theme}.png`),
                fullPage: true
            });
            await page.locator('body').click({ position: { x: 8, y: 8 } });
        }
    }
});
