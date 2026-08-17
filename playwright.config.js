const fs = require('node:fs');
const { defineConfig, devices } = require('@playwright/test');

const chromeCandidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const systemBrowser = chromeCandidates.find((candidate) => fs.existsSync(candidate));

module.exports = defineConfig({
    testDir: './tests/browser',
    outputDir: 'qa/artifacts/playwright',
    timeout: 45_000,
    expect: { timeout: 10_000 },
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: process.env.CI
        ? [['line'], ['json', { outputFile: 'qa/reports/playwright.json' }]]
        : [['list'], ['json', { outputFile: 'qa/reports/playwright.json' }]],
    use: {
        baseURL: 'http://127.0.0.1:4173',
        locale: 'ar-EG',
        colorScheme: 'dark',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off',
        launchOptions: systemBrowser ? { executablePath: systemBrowser } : undefined
    },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
        // Keep the local system-Chrome run deterministic. Native iPhone emulation
        // can close system Chrome on Windows; the responsive viewport still gives
        // us reliable mobile layout coverage. CI uses bundled Chromium when available.
        { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: false, deviceScaleFactor: 1 } }
    ],
    webServer: {
        command: 'node server.js',
        url: 'http://127.0.0.1:4173/api/health',
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: { ...process.env, PORT: '4173' }
    }
});
