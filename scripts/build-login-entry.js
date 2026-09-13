'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const publicDirectory = path.join(root, 'public');
const indexPath = path.join(publicDirectory, 'index.html');
const loginPath = path.join(publicDirectory, 'login.html');
const cssRoot = path.join(publicDirectory, 'css');
const loginCssPath = path.join(cssRoot, 'login-entry.css');

const cssLayers = [
    'tokens.css',
    'reset.css',
    'components/icons.css',
    'typography.css',
    'layout.css',
    'utilities.css',
    'components/buttons.css',
    'components/forms.css',
    'components/alerts.css',
    'pages/login.css',
    'responsive.css',
    'theme.css',
    'components/ui-foundation.css',
    'components/design-foundation.css',
    'components/navigation-shell.css',
    'components/visual-redesign.css'
];

const cssImportPattern = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/g;

function expandCss(file, chain = []) {
    const absolute = path.resolve(file);
    if (chain.includes(absolute)) {
        throw new Error(`Circular CSS import: ${[...chain, absolute].map((item) => path.relative(root, item)).join(' -> ')}`);
    }
    const source = fs.readFileSync(absolute, 'utf8');
    return source.replace(cssImportPattern, (_, importPath) => {
        if (/^(?:https?:|data:)/i.test(importPath)) return `@import url("${importPath}");`;
        const target = path.resolve(path.dirname(absolute), importPath);
        if (!fs.existsSync(target)) throw new Error(`${path.relative(root, absolute)} imports missing ${importPath}`);
        return `\n/* TOP GYM login layer: ${path.relative(root, target).replaceAll('\\', '/')} */\n${expandCss(target, [...chain, absolute])}\n/* END TOP GYM login layer */\n`;
    });
}

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
        ?.replace(/<link\s+rel="stylesheet"\s+href="\/css\/main\.css[^>]*>/i, `<link rel="stylesheet" href="/css/login-entry.css?v=${cssVersion}">`);
    const bodyOpen = source.match(/<body\b[^>]*>/i)?.[0]
        ?.replace('data-branding-entry="saas"', 'data-branding-entry="saas" data-auth-entry="login"');
    if (!htmlOpen || !head || !bodyOpen) throw new Error('Unable to derive login document shell from public/index.html');
    const authCard = readAuthCard(source);
    return `<!doctype html>\n${htmlOpen}\n${head}\n${bodyOpen}\n    <section class="auth-screen" id="authScreen" data-auth-stage="login" aria-label="بوابة الجيم">\n        <div class="auth-shell">\n${authCard.split('\n').map((line) => `            ${line}`).join('\n')}\n        </div>\n    </section>\n    <script defer src="/js/theme.js?v=1"></script>\n    <script defer src="/js/branding.js?v=5"></script>\n    <script defer src="/js/core/permissions.js?v=6"></script>\n    <script defer src="/js/auth-ui.js?v=20"></script>\n</body>\n</html>\n`;
}

const source = fs.readFileSync(indexPath, 'utf8');
const loginCss = cssLayers.map((layer) => expandCss(path.join(cssRoot, layer))).join('\n');
const minifiedCss = esbuild.transformSync(loginCss, {
    loader: 'css',
    minify: true,
    legalComments: 'none'
}).code.trim();
const cssVersion = crypto.createHash('sha256').update(minifiedCss).digest('hex').slice(0, 12);
fs.writeFileSync(loginCssPath, [
    '/* Logic Fit login entry stylesheet. */',
    '/* Generated from the shared CSS layers by npm run build:login-entry. */',
    '/* Edit the layer files, then rebuild; do not edit this artifact manually. */',
    minifiedCss,
    ''
].join('\n'), 'utf8');
fs.writeFileSync(loginPath, buildLoginHtml(source, cssVersion), 'utf8');
console.log(`[LOGIN-ENTRY-OK] generated ${path.relative(root, loginPath)} and ${path.relative(root, loginCssPath)}`);
