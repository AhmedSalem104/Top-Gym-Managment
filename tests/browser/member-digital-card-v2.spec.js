'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

test('digital membership card uses validated tenant Azure branding and keeps secure QR presentation', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1120, height: 1500 });
    await page.goto('/login.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
        const stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.href = '/css/main.css';
        document.head.append(stylesheet);
        document.body.innerHTML = `
            <dialog id="memberQrDialog" aria-label="بطاقة العضوية"><canvas id="memberQrCanvas" width="1080" height="1350"></canvas>
                <p id="memberQrStatus" role="status"></p><button id="memberQrClose"></button>
                <button id="memberQrDownload"></button><button id="memberQrShare"></button>
                <button id="memberQrWhatsapp"></button><button id="memberQrEditPhone"></button><button id="memberQrRetry"></button>
            </dialog>`;
        window.topGymAuth = { isOwner: () => true };
        window.topGymBranding = {
            refresh: async () => ({ loaded: true, branding: {
                identity: { brandName: 'Power Gym' },
                themes: { light: { primary: '#0A7FD5' } },
                assets: {}
            } }),
            assetUrl: () => ''
        };
        window.topGymLoadExternalAsset = () => Promise.resolve();
        window.QRCode = { toCanvas: async (canvas) => {
            const context = canvas.getContext('2d');
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = '#111827';
            for (let y = 0; y < 29; y += 1) for (let x = 0; x < 29; x += 1) {
                if ((x * 13 + y * 7) % 3 === 0) context.fillRect(x * 8, y * 8, 8, 8);
            }
        } };
    });
    await page.addScriptTag({ url: '/js/member-digital-card.js' });
    await page.evaluate(async () => window.topGymMemberDigitalCard.openCard({
        id: 712,
        fullName: 'عضو اختبار البطاقة',
        phone: '01012345678',
        membership: { status: 'active', plan: 'gym_only', type: 'monthly', startDate: '2026-10-01', endDate: '2026-10-31' }
    }, `LFQR1.${'A'.repeat(40)}`, 'created'));

    const dialog = page.locator('#memberQrDialog');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#memberQrStatus')).toContainText('البطاقة جاهزة');
    const cardState = await page.locator('#memberQrCanvas').evaluate((canvas) => {
        const context = canvas.getContext('2d');
        return {
            dimensions: [canvas.width, canvas.height],
            topAccent: [...context.getImageData(540, 50, 1, 1).data].slice(0, 3),
            qrCenter: [...context.getImageData(540, 950, 1, 1).data].slice(0, 3)
        };
    });
    expect(cardState.dimensions).toEqual([1080, 1350]);
    expect(cardState.topAccent).toEqual([10, 127, 213]);
    expect(cardState.qrCenter).not.toEqual([10, 127, 213]);

    const evidenceDir = path.join(__dirname, '../../qa/reports/logicfit-v2-member-card');
    await fs.mkdir(evidenceDir, { recursive: true });
    await page.locator('#memberQrCanvas').screenshot({ path: path.join(evidenceDir, 'tenant-branded-member-card.png') });
});
