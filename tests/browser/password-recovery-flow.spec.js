'use strict';

const { test, expect } = require('@playwright/test');

test('recovery-link flow submits only the token and replacement password, then offers login', async ({ page }) => {
    const token = 'A'.repeat(43);
    let submitted = null;
    let sessionReads = 0;
    await page.route('**/api/auth/session', async (route) => {
        sessionReads += 1;
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ authenticated: false }) });
    });
    await page.route('**/api/auth/password-recovery/complete', async (route) => {
        submitted = route.request().postDataJSON();
        await route.fulfill({ status: 204, body: '' });
    });

    await page.goto(`/reset-password#recovery=${token}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#forceNewPassword')).toBeVisible();
    await page.locator('#forceNewPassword').fill('safe-test-password-24');
    await page.locator('#forceConfirmPassword').fill('safe-test-password-24');
    await page.locator('#passwordChangeSubmit').click();

    await expect(page.locator('#passwordChangeMessage')).toBeVisible();
    await expect(page.locator('#passwordRecoveryBackToLogin')).toBeVisible();
    await expect(page.locator('#forceNewPassword')).toBeHidden();
    await expect(page.locator('#forceConfirmPassword')).toBeHidden();
    await expect(page.locator('#passwordChangeSubmit')).toBeHidden();
    expect(submitted).toEqual({ token, newPassword: 'safe-test-password-24', confirmPassword: 'safe-test-password-24' });
    expect(sessionReads).toBe(0);
    expect(new URL(page.url()).search).toBe('');
});
