'use strict';

const { test, expect } = require('@playwright/test');

test('subscriber action controls keep identical geometry and semantic hierarchy across themes', async ({ page }, testInfo) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.setContent(`<!doctype html><html data-theme="light"><head>
        <link rel="stylesheet" href="/css/main.css">
        </head><body data-theme="light"><table class="members-table"><tbody><tr><td class="actions-cell">
        <div class="table-actions">
          <button class="btn btn-light btn-small icon-action" data-action="renew" aria-label="Renew"><svg class="action-icon" viewBox="0 0 24 24"></svg></button>
          <button class="btn btn-light btn-small icon-action" data-action="freeze" aria-label="Freeze"><svg class="action-icon" viewBox="0 0 24 24"></svg></button>
          <button class="btn btn-light btn-small icon-action" data-action="details" aria-label="Details"><svg class="action-icon" viewBox="0 0 24 24"></svg></button>
          <div class="action-menu"><button class="action-menu-toggle" aria-label="More"><svg class="action-menu-icon" viewBox="0 0 24 24"></svg></button></div>
        </div>
        <span class="member-attendance-status unavailable">Unavailable</span>
        </td></tr></tbody></table></body></html>`);
    await page.waitForFunction(() => document.querySelector('link[href="/css/main.css"]')?.sheet?.cssRules?.length > 0);

    const byTheme = {};
    for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => {
            document.documentElement.dataset.theme = value;
            document.body.dataset.theme = value;
        }, theme);
        await page.waitForTimeout(350);
        byTheme[theme] = await page.locator('.actions-cell').evaluate((cell) => {
            const controls = [...cell.querySelectorAll('.table-actions > .icon-action, .action-menu-toggle')];
            const read = (element) => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return {
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    radius: style.borderRadius,
                    background: style.backgroundColor,
                    color: style.color
                };
            };
            return {
                controls: controls.map(read),
                primary: read(cell.querySelector('[data-action="renew"]')),
                secondary: read(cell.querySelector('[data-action="freeze"]')),
                more: read(cell.querySelector('.action-menu-toggle')),
                unavailable: read(cell.querySelector('.member-attendance-status.unavailable'))
            };
        });
        await testInfo.attach(`subscriber-actions-${theme}.png`, {
            body: await page.locator('.actions-cell').screenshot(),
            contentType: 'image/png'
        });
    }

    expect(byTheme.light.controls.map(({ width, height }) => [width, height]))
        .toEqual(byTheme.dark.controls.map(({ width, height }) => [width, height]));
    const controlSize = page.viewportSize().width <= 767 ? 40 : 38;
    expect(byTheme.light.controls.map(({ width, height }) => [width, height]))
        .toEqual(Array.from({ length: 4 }, () => [controlSize, controlSize]));
    for (const theme of ['light', 'dark']) {
        expect(byTheme[theme].primary.width).toBe(controlSize);
        expect(byTheme[theme].primary.height).toBe(controlSize);
        expect(byTheme[theme].primary.background).not.toBe(byTheme[theme].secondary.background);
        expect(byTheme[theme].secondary.background).toBe(byTheme[theme].more.background);
        expect(byTheme[theme].unavailable.color).not.toBe(byTheme[theme].primary.color);
    }
});
