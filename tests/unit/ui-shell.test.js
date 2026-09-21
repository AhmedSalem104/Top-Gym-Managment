const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

test('navigation pending state remains a functional JS/DOM contract during reset', () => {
    const state = fs.readFileSync(path.join(root, 'public/css/functional-state.css'), 'utf8');
    const source = fs.readFileSync(path.join(root, 'public/js/page-tabs.js'), 'utf8');
    assert.match(state, /auth-pending/);
    assert.match(source, /top-gym-navigation-pending/);
});

test('desktop sidebar hover behavior remains in the existing navigation runtime', () => {
    const script = fs.readFileSync(path.join(root, 'public/js/page-tabs.js'), 'utf8');
    assert.match(script, /function initSidebarTooltip\(rail\)/u);
    assert.match(script, /hoverOpenTimer\s*=\s*window\.setTimeout\(revealRail,\s*120\)/u);
});

test('navigation reset removes the old visual owner without changing the runtime hooks', () => {
    const source = fs.readFileSync(path.join(root, 'public/js/page-tabs.js'), 'utf8');
    assert.match(source, /mobile-nav-open/);
    assert.match(source, /sidebar-expanded/);
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'public/index.html'), 'utf8'), /\/css\/components\/navigation-shell\.css/u);
});

test('Gym App shell has one Tailwind shared owner plus the functional state source', () => {
    const files = fs.readdirSync(path.join(root, 'public/css'), { withFileTypes: true });
    assert.deepEqual(files.filter((entry) => entry.isFile()).map((entry) => entry.name).sort(), ['app-shell.css', 'app-shell.source.css', 'functional-state.css', 'login-entry.css', 'main.css', 'main.source.css', 'shared-components.source.css', 'tailwind.source.css']);
    assert.match(fs.readFileSync(path.join(root, 'public/css/app-shell.source.css'), 'utf8'), /tailwind\.source\.css/u);
});

test('shared Tailwind foundation owns the application-wide component contracts', () => {
    const shared = fs.readFileSync(path.join(root, 'public/css/shared-components.source.css'), 'utf8');
    const tailwind = fs.readFileSync(path.join(root, 'public/css/tailwind.source.css'), 'utf8');
    assert.match(tailwind, /shared-components\.source\.css/u);
    for (const selector of ['form label', '\.data-table', '\.branch-context-trigger', '\.branch-context-menu', 'dialog', '\.pagination']) {
        assert.match(shared, new RegExp(selector));
    }
    assert.match(tailwind, /\.btn-primary/u);
    assert.doesNotMatch(shared, /!important/u);
});
