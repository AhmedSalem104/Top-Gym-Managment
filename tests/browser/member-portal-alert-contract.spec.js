const { test, expect } = require('@playwright/test');

test('Member Portal alert semantics come from the centralized Alerts contract', async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({})
    }));
    await page.goto('/member-portal.html', { waitUntil: 'domcontentloaded' });

    const errorSurface = page.locator('#portalError');
    await expect(errorSurface).toBeAttached();
    const styles = await errorSurface.evaluate(element => {
        const reference = document.createElement('div');
        reference.className = 'error-state';
        document.body.append(reference);
        const actual = getComputedStyle(element);
        const expected = getComputedStyle(reference);
        const result = {
            background: actual.backgroundColor,
            expectedBackground: expected.backgroundColor,
            color: actual.color,
            expectedColor: expected.color,
            borderColor: actual.borderTopColor,
            expectedBorderColor: expected.borderTopColor,
            radius: actual.borderTopLeftRadius,
            expectedRadius: expected.borderTopLeftRadius
        };
        reference.remove();
        return result;
    });

    expect(styles.background).toBe(styles.expectedBackground);
    expect(styles.color).toBe(styles.expectedColor);
    expect(styles.borderColor).toBe(styles.expectedBorderColor);
    expect(styles.radius).toBe(styles.expectedRadius);
});
