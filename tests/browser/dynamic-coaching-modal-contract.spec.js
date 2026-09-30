const { test, expect } = require('@playwright/test');

async function openDynamicCoachingDialog(page) {
    await page.evaluate(() => {
        document.getElementById('coachingContractFixture')?.remove();
        const dialog = document.createElement('dialog');
        dialog.id = 'coachingContractFixture';
        dialog.className = 'coaching-small-dialog rounded-lg border-slate-200 shadow-lift';
        dialog.innerHTML = `
            <form class="dialog-body">
                <div class="details-dialog-head"><div><h3>متابعة يومية</h3><p>تسجيل حالة المتدرب</p></div><button type="button">إغلاق</button></div>
                <div class="field-grid"><label>التاريخ<input type="date"></label><label>النوم<input type="number"></label></div>
                <div class="dialog-actions"><button type="button">إلغاء</button><button type="submit">حفظ</button></div>
            </form>`;
        document.body.append(dialog);
        dialog.showModal();
    });
    const dialog = page.locator('#coachingContractFixture');
    await expect(dialog).toHaveClass(/lf-modal--structured/u);
    await expect(dialog).toHaveClass(/lf-modal--md/u);
    await expect(dialog.locator(':scope > form.dialog-body')).toBeVisible();
    await expect(dialog.locator(':scope > form.dialog-body')).not.toHaveClass(/lf-modal-layout/u);
    return dialog;
}

test.describe('dynamic Coaching modal contract', () => {
    test('runtime enhancer applies the central shell to dynamically-created Coaching dialogs', async ({ page }) => {
        await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
        await page.addScriptTag({ url: '/js/dialog-enhancements.js' });
        const dialog = await openDynamicCoachingDialog(page);

        const result = await dialog.evaluate((element) => {
            const form = element.querySelector(':scope > form.dialog-body');
            const header = form.querySelector('.details-dialog-head');
            const footer = form.querySelector('.dialog-actions');
            const bounds = element.getBoundingClientRect();
            return {
                inViewport: bounds.left >= 0 && bounds.top >= 0
                    && bounds.right <= innerWidth && bounds.bottom <= innerHeight,
                shellDisplay: getComputedStyle(element).display,
                formScroller: getComputedStyle(form).overflowY,
                headerSticky: getComputedStyle(header).position,
                footerSticky: getComputedStyle(footer).position,
                generatedClose: Boolean(element.querySelector(':scope > .dialog-close-button[data-dialog-close-generated]'))
            };
        });
        expect(result).toEqual({
            inViewport: true,
            shellDisplay: 'flex',
            formScroller: 'auto',
            headerSticky: 'sticky',
            footerSticky: 'sticky',
            generatedClose: true
        });
    });

    test('structured shell remains contained across supported viewport sizes and themes', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'The breakpoint sweep runs once in the desktop project.');
        await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
        await page.addScriptTag({ url: '/js/dialog-enhancements.js' });
        for (const theme of ['light', 'dark']) {
            await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
            for (const width of [1440, 1024, 768, 390, 320]) {
                await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
                const dialog = await openDynamicCoachingDialog(page);
                const geometry = await dialog.evaluate((element) => {
                    const rect = element.getBoundingClientRect();
                    const form = element.querySelector(':scope > form');
                    return {
                        fits: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
                        singleScrollOwner: getComputedStyle(form).overflowY === 'auto'
                    };
                });
                expect(geometry).toEqual({ fits: true, singleScrollOwner: true });
                await dialog.evaluate((element) => element.close());
                await dialog.evaluate((element) => element.remove());
            }
        }
    });
});
