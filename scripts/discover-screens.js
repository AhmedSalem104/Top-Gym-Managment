'use strict';

/*
 * Static UI inventory for the Vanilla Logic Fit surfaces.
 *
 * This intentionally does not execute application code or make network
 * requests. It gives UI QA a repeatable source of truth for HTML entry
 * pages, hash tabs, nested views, forms and overlay roots.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, 'public');
const docsRoot = path.join(root, 'docs');
const inventoryPath = path.join(docsRoot, 'COMPLETE-SCREEN-INVENTORY.md');

function read(file) {
    return fs.readFileSync(file, 'utf8');
}

function unique(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function filesUnder(directory, extension) {
    const result = [];
    const visit = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const file = path.join(current, entry.name);
            if (entry.isDirectory()) visit(file);
            else if (!extension || file.endsWith(extension)) result.push(file);
        }
    };
    visit(directory);
    return result;
}

function attributeValues(source, attribute) {
    const pattern = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'gi');
    return unique([...source.matchAll(pattern)].map((match) => match[1].trim()));
}

function idValues(source) {
    return unique([...source.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1].trim()));
}

function elementIds(source, tagName, requiredAttribute = '') {
    const pattern = new RegExp(`<${tagName}\\b([^>]*)>`, 'gi');
    return unique([...source.matchAll(pattern)]
        .filter((match) => !requiredAttribute || new RegExp(`\\b${requiredAttribute}\\s*=`, 'i').test(match[1]))
        .map((match) => match[1].match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1]));
}

function roleElementIds(source, role) {
    const pattern = /<([a-z][a-z0-9:-]*)\b([^>]*)>/gi;
    return unique([...source.matchAll(pattern)]
        .filter((match) => new RegExp(`\\brole\\s*=\\s*["']${role}["']`, 'i').test(match[2]))
        .map((match) => match[2].match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1]));
}

function pathLabel(file) {
    return path.relative(root, file).replaceAll('\\', '/');
}

function surfaceFor(file) {
    const name = path.basename(file).toLowerCase();
    if (name === 'platform-admin.html') return 'Platform Admin';
    if (name === 'member-portal.html') return 'Member Portal';
    if (name === 'register-gym.html') return 'Register Gym';
    if (name === 'index.html') return 'Gym Application / Public Entry';
    return 'Shared / Embedded';
}

const htmlFiles = filesUnder(publicRoot, '.html');
const jsFiles = filesUnder(path.join(publicRoot, 'js'), '.js');
const htmlSources = htmlFiles.map((file) => ({ file, source: read(file) }));
const jsSource = jsFiles.map(read).join('\n');

const entryPages = htmlSources.map(({ file, source }) => ({
    surface: surfaceFor(file),
    route: path.basename(file) === 'index.html' ? '/' : `/${path.basename(file, '.html')}`,
    file: pathLabel(file),
    title: (source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim()
}));

const discoveredHashViews = unique([
    ...htmlSources.flatMap(({ source }) => attributeValues(source, 'data-page-tab')),
    ...htmlSources.flatMap(({ source }) => attributeValues(source, 'data-page-tab-link')),
    ...htmlSources.flatMap(({ source }) => attributeValues(source, 'data-page-tab-panel')),
    ...[...jsSource.matchAll(/(?:pageTab|pageTabLink|tabName|activeTabName|normalizeTab)\s*[:=(,]?\s*["']([a-z0-9-]+)["']/gi)].map((match) => match[1]),
    ...['dashboard', 'members', 'expenses', 'management', 'branding', 'member-payment-methods', 'saas-billing', 'backup-history', 'member-subscription-requests', 'portal-analytics', 'permissions', 'reports', 'feedback', 'attendance', 'library', 'trainees', 'intelligence', 'store']
]);
// The old in-shell platform tab is intentionally removed by page-tabs.js. Keep
// it visible in the source audit, but do not count it as an active screen.
const legacyHashViews = discoveredHashViews.filter((value) => value === 'platform');
const hashViews = discoveredHashViews.filter((value) => !legacyHashViews.includes(value));

const nestedViews = unique([
    ...htmlSources.flatMap(({ source }) => attributeValues(source, 'data-store-view')),
    ...htmlSources.flatMap(({ source }) => attributeValues(source, 'data-store-view-panel')),
    ...htmlSources.flatMap(({ source }) => attributeValues(source, 'data-report-tab')),
    ...htmlSources.flatMap(({ source }) => attributeValues(source, 'data-portal-tool')),
    ...htmlSources.flatMap(({ source }) => attributeValues(source, 'data-registration-step')),
    ...htmlSources.flatMap(({ source }) => attributeValues(source, 'data-step-indicator'))
]);

const allIds = unique(htmlSources.flatMap(({ source }) => idValues(source)));
const platformPanels = unique([
    ...htmlSources.flatMap(({ source }) => attributeValues(source, 'data-platform-panel')),
    ...htmlSources.flatMap(({ source }) => attributeValues(source, 'data-platform-view'))
]);
const registrationSteps = unique(htmlSources.flatMap(({ source }) => attributeValues(source, 'data-registration-step')));
const portalRootIds = unique(allIds.filter((id) => /^portal(?:LoginPanel|Result|HomeView|FeedbackSection|SubscriptionSection|LibrarySection)$/.test(id)));
const storeViewValues = ['pos', 'products', 'inventory', 'purchases', 'sales', 'suppliers', 'expenses', 'reports', 'bar']
    .filter((value) => nestedViews.includes(value));
const portalToolValues = ['print', 'feedback', 'exercises', 'foods', 'subscription']
    .filter((value) => nestedViews.includes(value));
const overlayIds = unique([
    ...htmlSources.flatMap(({ source }) => elementIds(source, 'dialog')),
    ...htmlSources.flatMap(({ source }) => roleElementIds(source, 'dialog'))
]).filter((id) => id && /(?:dialog|modal|drawer|sheet|overlay|confirm|qr|scanner|preview)/i.test(id));
const formIds = allIds.filter((id) => /(?:form|filter|search|upload|checkout|login|registration)/i.test(id));
const stateHooks = allIds.filter((id) => /(?:loading|skeleton|empty|error|message|success|status|toast|pagination|history)/i.test(id));

const browserReportPath = path.join(root, 'qa', 'reports', 'complete-ui-qa.json');
let browserReport = null;
try {
    browserReport = JSON.parse(fs.readFileSync(browserReportPath, 'utf8')).report || null;
} catch (_) {
    browserReport = null;
}
const browserReportMatchesInventory = Boolean(browserReport
    && browserReport.status === 'PASS'
    && Number(browserReport.appScreenCount) === hashViews.length
    && Number(browserReport.platformPanelCount) === platformPanels.length
    && Number(browserReport.registrationStepCount) === registrationSteps.length
    && Number(browserReport.portalSurfaceCount) === portalRootIds.length
    && Number(browserReport.storeViewCount) === storeViewValues.length
    && Number(browserReport.portalToolCount) === portalToolValues.length
    && Number(browserReport.dialogCount) === overlayIds.length);
const structuralReviewStatus = browserReportMatchesInventory ? 'STRUCTURAL QA PASS' : 'NOT VERIFIED';

const lines = [];
lines.push('# Logic Fit — Complete Screen Inventory');
lines.push('');
lines.push('> Generated by `scripts/discover-screens.js`. This is a static discovery artifact; visual, responsive, accessibility and interaction status must be verified separately.');
lines.push('');
lines.push(`- Generated at: ${new Date().toISOString()}`);
lines.push(`- HTML entry pages discovered: ${entryPages.length}`);
lines.push(`- Hash views discovered: ${hashViews.length}`);
lines.push(`- Legacy hash markers (not active screens): ${legacyHashViews.length}`);
lines.push(`- Platform Admin panels discovered: ${platformPanels.length}`);
lines.push(`- Registration steps discovered: ${registrationSteps.length}`);
lines.push(`- Member Portal roots discovered: ${portalRootIds.length}`);
lines.push(`- Store subviews discovered: ${storeViewValues.length}`);
lines.push(`- Member Portal tools discovered: ${portalToolValues.length}`);
lines.push(`- Nested view/step hooks discovered: ${nestedViews.length}`);
lines.push(`- Overlay roots discovered: ${overlayIds.length}`);
lines.push(`- Form/filter hooks discovered: ${formIds.length}`);
lines.push('');
lines.push('## Release gate');
lines.push('');
lines.push('| Metric | Current status |');
lines.push('|---|---|');
lines.push(`| Discovered screens | ${hashViews.length} active app views + ${platformPanels.length} platform panels + ${registrationSteps.length} registration steps + ${portalRootIds.length} portal roots + ${storeViewValues.length} Store subviews + ${portalToolValues.length} Portal tools + ${overlayIds.length} overlay roots |`);
lines.push(`| Structural review | ${structuralReviewStatus} |`);
lines.push(`| Visual QA | ${structuralReviewStatus} |`);
lines.push(`| Responsive QA | ${structuralReviewStatus} |`);
lines.push(`| RTL / theme / accessibility QA | ${structuralReviewStatus === 'STRUCTURAL QA PASS' ? 'RTL/theme smoke PASS; accessibility engine NOT VERIFIED' : 'NOT VERIFIED'} |`);
lines.push('');
lines.push('## Entry surfaces');
lines.push('');
lines.push('| Surface | Route | Purpose | Source | Review status |');
lines.push('|---|---|---|---|---|');
for (const page of entryPages) {
    lines.push(`| ${page.surface} | \`${page.route}\` | ${page.title || 'Entry page'} | \`${page.file}\` | ${structuralReviewStatus} |`);
}
lines.push('');
lines.push('## Application hash views');
lines.push('');
if (legacyHashViews.length) {
    lines.push(`> Legacy source markers excluded from the active count: ${legacyHashViews.map((value) => `\`${value}\``).join(', ')}. ` +
        'The application removes these markers at runtime; the active Platform Admin surface is `/platform-admin`.');
    lines.push('');
}
lines.push('| View | Route | Parent | User roles | Primary state review |');
lines.push('|---|---|---|---|---|');
for (const view of hashViews) {
    lines.push(`| ${view} | \`#${view}\` | Gym Application | Owner / Assistant by permission | ${structuralReviewStatus} |`);
}
lines.push('');
lines.push('## Platform Admin panels');
lines.push('');
lines.push('| Panel | Route | Review status |');
lines.push('|---|---|---|');
for (const panel of platformPanels) lines.push(`| \`${panel}\` | \`/platform-admin\` | ${structuralReviewStatus} |`);
lines.push('');
lines.push('## Member Portal roots');
lines.push('');
lines.push('| Root | Route | Review status |');
lines.push('|---|---|---|');
for (const id of portalRootIds) lines.push(`| \`${id}\` | \`/member-portal\` | ${structuralReviewStatus} |`);
lines.push('');
lines.push('## Registration steps');
lines.push('');
lines.push('| Step | Route | Review status |');
lines.push('|---|---|---|');
for (const step of registrationSteps) lines.push(`| \`${step}\` | \`/register-gym\` | ${structuralReviewStatus} |`);
lines.push('');
lines.push('## Store subviews');
lines.push('');
lines.push('| View | Parent route | Review status |');
lines.push('|---|---|---|');
for (const view of storeViewValues) lines.push(`| \`${view}\` | \`#store\` | ${structuralReviewStatus} |`);
lines.push('');
lines.push('## Member Portal tools');
lines.push('');
lines.push('| Tool | Parent route | Review status |');
lines.push('|---|---|---|');
for (const tool of portalToolValues) lines.push(`| \`${tool}\` | \`/member-portal\` | ${structuralReviewStatus} |`);
lines.push('');
lines.push('## Legacy source markers');
lines.push('');
if (legacyHashViews.length) {
    for (const view of legacyHashViews) lines.push(`- \`${view}\` — source marker intentionally removed at runtime by the active router.`);
} else {
    lines.push('- None discovered.');
}
lines.push('');
lines.push('## Nested views and workflow steps');
lines.push('');
lines.push('| Hook/value | Source surface | Category | Review status |');
lines.push('|---|---|---|---|');
for (const value of nestedViews) {
    const category = /^\d+$/.test(value) ? 'Wizard/step indicator' : 'Nested tab/view';
    const surface = value === '1' || value === '2' || value === '3' || value === '4' || value === '5' || value === '6' ? 'Register Gym' : 'Gym Application / embedded feature';
    const status = /^\d+$/.test(value) || storeViewValues.includes(value) || portalToolValues.includes(value)
        ? structuralReviewStatus
        : 'SOURCE DISCOVERED — SEE SURFACE QA';
    lines.push(`| \`${value}\` | ${surface} | ${category} | ${status} |`);
}
lines.push('');
lines.push('## Overlay roots');
lines.push('');
lines.push('| Element id | Source page | State review |');
lines.push('|---|---|---|');
for (const id of overlayIds) {
    const source = htmlSources.find(({ source }) => source.includes(`id="${id}"`) || source.includes(`id='${id}'`));
    lines.push(`| \`${id}\` | \`${source ? pathLabel(source.file) : 'unknown'}\` | ${structuralReviewStatus} |`);
}
lines.push('');
lines.push('## Forms, search and action surfaces');
lines.push('');
lines.push('| Element id | Source page | Review status |');
lines.push('|---|---|---|');
for (const id of formIds) {
    const source = htmlSources.find(({ source }) => source.includes(`id="${id}"`) || source.includes(`id='${id}'`));
    lines.push(`| \`${id}\` | \`${source ? pathLabel(source.file) : 'unknown'}\` | SOURCE DISCOVERED — AUTHENTICATED ACTION QA REQUIRED |`);
}
lines.push('');
lines.push('## State hooks');
lines.push('');
lines.push('These hooks identify places where Loading/Empty/Error/Success/Status behavior should be reviewed. They are not proof that every state is implemented.');
lines.push('');
lines.push('| Element id | Source page | State coverage |');
lines.push('|---|---|---|');
for (const id of stateHooks) {
    const source = htmlSources.find(({ source }) => source.includes(`id="${id}"`) || source.includes(`id='${id}'`));
    lines.push(`| \`${id}\` | \`${source ? pathLabel(source.file) : 'unknown'}\` | SOURCE DISCOVERED — STATE QA REQUIRED |`);
}
lines.push('');
lines.push('## Verification protocol');
lines.push('');
lines.push('For every discovered surface, record evidence for Desktop, Tablet, Mobile, RTL, Light, Dark, keyboard/accessibility, Loading, Loaded, Empty, Error, Permission and critical interactions. Do not mark a row as verified from static discovery alone.');
lines.push('');
lines.push('## Source files scanned');
lines.push('');
for (const page of entryPages) lines.push(`- \`${page.file}\``);
for (const file of jsFiles.map(pathLabel)) lines.push(`- \`${file}\``);
lines.push('');

fs.mkdirSync(docsRoot, { recursive: true });
fs.writeFileSync(inventoryPath, `${lines.join('\n').replace(/\n+$/, '')}\n`, 'utf8');

if (process.argv.includes('--check')) {
    const generated = read(inventoryPath);
    if (!generated.includes('## Release gate')) {
        console.error('Screen inventory is missing its generated release-gate marker.');
        process.exitCode = 1;
    }
    if (process.argv.includes('--verify-browser')) {
        if (!browserReportMatchesInventory) {
            console.error('Screen inventory does not match a passing complete browser report. Run npm run test:visual:complete first.');
            process.exitCode = 1;
        }
    }
}

console.log(JSON.stringify({
    htmlPages: entryPages.length,
    hashViews: hashViews.length,
    nestedViews: nestedViews.length,
    storeViews: storeViewValues.length,
    portalTools: portalToolValues.length,
    overlays: overlayIds.length,
    forms: formIds.length,
    stateHooks: stateHooks.length,
    output: pathLabel(inventoryPath)
}, null, 2));
