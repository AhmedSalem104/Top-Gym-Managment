const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const ORIGIN = 'http://127.0.0.1:4173';
const ARTIFACTS = path.resolve(process.cwd(), 'qa/artifacts/feature-dialogs-v2');
const VIEWPORTS = [
    { width: 320, height: 760 },
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 1000 }
];
const DIALOGS = [
    { id: 'backupRestoreDialog', source: 'backup.html', title: 'استعادة نسخة احتياطية' },
    { id: 'authUserDialog', source: 'permissions.html', title: 'إضافة مساعد' },
    { id: 'libraryFormDialog', source: 'library.html', title: 'إضافة عنصر' },
    { id: 'libraryDetailsDialog', source: 'library.html', title: 'تفاصيل العنصر' },
    { id: 'externalTraineeDialog', source: 'coaching.html', title: 'إضافة متدرب خارجي' },
    { id: 'coachingBuilderDialog', source: 'coaching.html', title: 'إنشاء نظام تدريبي' },
    { id: 'coachingProfileDialog', source: 'coaching.html', title: 'ملف المتدرب' }
];

test.describe('V2 feature dialogs responsive visual contract', () => {
    for (const viewport of VIEWPORTS) {
        for (const theme of ['light', 'dark']) {
            test(`feature dialogs fit ${viewport.width}px ${theme}`, async ({ page }, testInfo) => {
                test.skip(testInfo.project.name !== 'desktop', 'The viewport/theme matrix runs once in desktop.');
                await page.setViewportSize(viewport);
                await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'domcontentloaded' });
                await page.addStyleTag({ url: `${ORIGIN}/css/main.css` });
                await page.evaluate(async ({ themeName, dialogSpecs }) => {
                    document.documentElement.lang = 'ar';
                    document.documentElement.dir = 'rtl';
                    document.documentElement.dataset.theme = themeName;
                    document.body.dataset.theme = themeName;
                    for (const source of [...new Set(dialogSpecs.map((item) => item.source))]) {
                        const response = await fetch(`/dialogs/${source}`);
                        if (!response.ok) throw new Error(`Unable to load dialog fixture ${source}`);
                        const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
                        for (const dialog of parsed.querySelectorAll('dialog')) document.body.append(dialog);
                    }
                    const fill = (selector, html) => {
                        const target = document.querySelector(selector);
                        if (target) target.innerHTML = html;
                    };
                    fill('#libraryFormFields', '<div class="field-grid"><label class="field">اسم العنصر<input value="عنصر اختبار طويل لقياس التفاف النص"></label><label class="field">التصنيف<input value="اختبار"></label></div>');
                    fill('#libraryDetailsContent', '<section class="panel"><h4>تفاصيل العنصر</h4><p>محتوى وصفي طويل لاختبار التفاف النص ومساحة الحوار عند أحجام العرض الصغيرة.</p></section>');
                    fill('#coachingBuilderContent', '<div class="field-grid"><label class="field">اسم البرنامج<input value="برنامج تدريبي تجريبي"></label><label class="field">المدة<input value="8 أسابيع"></label></div><section class="panel"><h4>تفاصيل البرنامج</h4><p>بيانات تدريب تجريبية للعرض فقط.</p></section>');
                    fill('#coachingProfileContent', '<section class="profile-stats"><article><span>الجلسات</span><strong>12</strong></article><article><span>الالتزام</span><strong>88%</strong></article></section><p>تفاصيل تجريبية لملف المتدرب.</p>');
                }, { themeName: theme, dialogSpecs: DIALOGS });
                await page.addScriptTag({ url: '/js/dialog-enhancements.js' });
                await page.evaluate(() => document.fonts.ready);

                for (const spec of DIALOGS) {
                    const dialog = page.locator(`#${spec.id}`);
                    await expect(dialog, `${spec.id} should exist in its actual fragment`).toHaveCount(1);
                    await dialog.evaluate((element) => element.showModal());
                    await expect(dialog).toBeVisible();
                    await expect(dialog).toHaveClass(/lf-modal--structured/u);
                    if (['backupRestoreDialog', 'externalTraineeDialog'].includes(spec.id)) {
                        const titleId = spec.id === 'backupRestoreDialog' ? 'backupRestoreTitle' : 'externalTraineeTitle';
                        await expect(dialog).toHaveAttribute('aria-labelledby', titleId);
                        await expect(page.locator(`#${titleId}`)).toBeVisible();
                    }
                    const geometry = await dialog.evaluate((element) => {
                        const rect = element.getBoundingClientRect();
                        const form = element.querySelector(':scope > form.dialog-body');
                        const content = form || element.querySelector(':scope > .dialog-body');
                        const contentRect = content?.getBoundingClientRect();
                        return {
                            insideViewport: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
                            contentInside: !contentRect || (contentRect.left >= rect.left - 1 && contentRect.right <= rect.right + 1),
                            shellWidth: Math.round(rect.width),
                            viewportWidth: innerWidth,
                            contentMinWidth: content ? getComputedStyle(content).minWidth : null,
                            bodyScroll: content ? getComputedStyle(content).overflowY : null,
                            pageWidth: document.documentElement.scrollWidth
                        };
                    });
                    expect(geometry.insideViewport, `${spec.id} must stay in the viewport: ${JSON.stringify(geometry)}`).toBeTruthy();
                    expect(geometry.contentInside, `${spec.id} content must remain inside its shell`).toBeTruthy();
                    expect(geometry.pageWidth, `${spec.id} must not cause page-level horizontal overflow`).toBeLessThanOrEqual(viewport.width);
                    expect(geometry.shellWidth).toBeLessThanOrEqual(viewport.width);
                    if (spec.id === 'coachingBuilderDialog') {
                        const primaryActionColor = await dialog.locator('#coachingBuilderNext').evaluate((element) => getComputedStyle(element).backgroundColor);
                        const canonicalPrimaryColor = await page.evaluate(() => {
                            const swatch = document.createElement('span');
                            swatch.style.backgroundColor = 'var(--color-primary)';
                            document.body.append(swatch);
                            const color = getComputedStyle(swatch).backgroundColor;
                            swatch.remove();
                            return color;
                        });
                        expect(primaryActionColor, 'the default builder action should use the canonical V2 primary accent').toBe(canonicalPrimaryColor);
                    }
                    const minWidthGuard = {
                        libraryFormDialog: '#libraryFormFields',
                        libraryDetailsDialog: '#libraryDetailsContent',
                        externalTraineeDialog: ':scope > form.dialog-body'
                    }[spec.id];
                    if (viewport.width <= 390 && minWidthGuard) {
                        const guardedMinWidth = await dialog.locator(minWidthGuard).evaluate((element) => getComputedStyle(element).minWidth);
                        expect(guardedMinWidth, `${spec.id} should apply its local min-width guard`).toBe('0px');
                    }

                    await fs.mkdir(ARTIFACTS, { recursive: true });
                    await page.screenshot({ path: path.join(ARTIFACTS, `${spec.id}-${viewport.width}-${theme}.png`) });
                    await dialog.evaluate((element) => element.close());
                }
            });
        }
    }
});
