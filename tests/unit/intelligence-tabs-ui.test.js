const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('operational intelligence uses equal accessible local tabs without replacing its existing content nodes', () => {
    const script = read('public/js/pages/intelligence/intelligence.js');
    const styles = read('public/css/pages/intelligence.css');
    const translations = read('public/js/core/i18n.js');
    const spec = read('docs/LOGIC_FIT_V2_DESIGN_SYSTEM.md');

    assert.match(script, /function initContentTabs\(\)/u);
    assert.match(script, /nodes:\s*\[stats, priorities, retention\]/u);
    assert.match(script, /nodes:\s*\[assistant\]/u);
    assert.match(script, /nodes:\s*\[plans\]/u);
    assert.match(script, /role',\s*'tabpanel'/u);
    assert.match(script, /setAttribute\('aria-selected',\s*String\(active\)\)/u);
    assert.match(script, /planTypeTabs\?\.classList\.add\('tabs',\s*'tabs--section-switcher'\)/u);
    assert.match(script, /button\.textContent\s*=\s*t\(button\.dataset\.intelligenceType\s*===\s*'diet'/u);
    assert.match(script, /setAttribute\('aria-controls',\s*panelId\)/u);
    assert.match(styles, /\.intelligence-plan-type\s*>\s*\[role="tab"\]\s*\{\s*flex:\s*1/u);
    assert.doesNotMatch(styles, /\.intelligence-plan-type button\.is-active/u);
    assert.match(script, /event\.key === 'Home'[\s\S]*?event\.key === 'End'[\s\S]*?event\.key === 'ArrowRight'[\s\S]*?event\.key === 'ArrowLeft'/u);
    assert.match(styles, /\.intelligence-content-tabs[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/u);
    assert.match(translations, /'intelligenceScreen\.tabs\.overview':\s*'نظرة عامة'/u);
    assert.match(translations, /'intelligenceScreen\.tabs\.overview':\s*'Overview'/u);
    assert.match(spec, /Operational intelligence workspace:[\s\S]*?three equal-size accessible local tabs/u);
});
