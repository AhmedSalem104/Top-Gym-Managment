'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { buildLoginEntryStyles } = require('./build-tailwind');

const root = path.resolve(__dirname, '..');
const publicDirectory = path.join(root, 'public');
const indexPath = path.join(publicDirectory, 'index.html');
const loginPath = path.join(publicDirectory, 'login.html');
const cssRoot = path.join(publicDirectory, 'css');
const loginCssPath = path.join(cssRoot, 'login-entry.css');

function readAuthCard(source) {
    const startMarker = '<!-- AUTH_ENTRY_CARD_START -->';
    const endMarker = '<!-- AUTH_ENTRY_CARD_END -->';
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker);
    if (start < 0 || end < 0 || end <= start) throw new Error('Login entry markers are missing or out of order');
    return source.slice(start + startMarker.length, end).trim();
}

function buildLoginHtml(source, cssVersion) {
    const htmlOpen = source.match(/<html\b[^>]*>/i)?.[0];
    const head = source.match(/<head>[\s\S]*?<\/head>/i)?.[0]
        ?.replace(/[ \t]*<link\s+rel="stylesheet"\s+href="\/css\/pages\/login\.css[^>]*>\r?\n?/i, '')
        ?.replace(/<link\s+rel="stylesheet"\s+href="\/css\/(?:main|app-shell)\.css[^>]*>/i, `<link rel="stylesheet" href="/css/login-entry.css?v=${cssVersion}">`);
    const bodyOpen = source.match(/<body\b[^>]*>/i)?.[0]
        ?.replace('data-branding-entry="saas"', 'data-branding-entry="saas" data-auth-entry="login"');
    if (!htmlOpen || !head || !bodyOpen) throw new Error('Unable to derive login document shell from public/index.html');
    const authCard = readAuthCard(source);
    return `<!doctype html>\n${htmlOpen}\n${head}\n${bodyOpen}\n    <section class="auth-screen" id="authScreen" data-auth-stage="login" aria-label="بوابة الجيم">\n        <div class="auth-shell">\n${authCard.split('\n').map((line) => `            ${line}`).join('\n')}\n        </div>\n    </section>\n    <script defer src="/js/theme.js?v=1"></script>\n    <script defer src="/js/branding.js?v=5"></script>\n    <script defer src="/js/core/permissions.js?v=6"></script>\n    <script defer src="/js/auth-ui.js?v=20"></script>\n</body>\n</html>\n`;
}

const source = fs.readFileSync(indexPath, 'utf8');
buildLoginEntryStyles();
const generatedCss = fs.readFileSync(loginCssPath, 'utf8');
const cssVersion = crypto.createHash('sha256').update(generatedCss).digest('hex').slice(0, 12);
fs.writeFileSync(loginPath, buildLoginHtml(source, cssVersion).replaceAll('/js/auth-ui.js?v=20', '/js/auth-ui.js?v=21'), 'utf8');
console.log(`[LOGIN-ENTRY-OK] generated ${path.relative(root, loginPath)} and ${path.relative(root, loginCssPath)}`);
