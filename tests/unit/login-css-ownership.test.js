'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const loginCss = read('public/css/pages/login.css');
const visualPath = path.join(root, 'public/css/components/visual-redesign.css');
const visualCss = fs.existsSync(visualPath) ? fs.readFileSync(visualPath, 'utf8') : '';

const pageOwnedSelectors = [
  '.auth-screen[data-auth-stage="gateway"] .saas-entry-card',
  '.saas-entry-card',
  '.saas-entry-brand',
  '.saas-entry-copy',
  '.saas-entry-action',
  '.saas-entry-feature-icon',
  '.saas-entry-features article',
  '.saas-entry-layout',
  '.saas-entry-copy h1',
  '.saas-entry-continue',
  '.auth-screen[data-auth-stage="login"] .auth-card',
  '.auth-screen[data-auth-stage="login"] .auth-form-panel',
  '.auth-screen[data-auth-stage="login"] .auth-form-heading'
];

test('login and public-entry presentation is owned by the canonical page stylesheet', () => {
  for (const selector of pageOwnedSelectors) {
    assert.ok(loginCss.includes(selector), `login.css must own ${selector}`);
  }
  assert.doesNotMatch(visualCss, /\.saas-entry-(?:card|layout|copy|action|continue|preview)|\.auth-screen|\.auth-card|\.auth-form-panel|\.auth-form-heading/);
});

test('login/public-entry canonical rules retain responsive, theme, and form styling without duplicate legacy overrides', () => {
  assert.match(loginCss, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.saas-entry-layout\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(loginCss, /html\[data-theme="dark"\] \.auth-screen\[data-auth-stage="login"\] \.auth-form-panel/);
  assert.match(loginCss, /\.auth-form \.auth-input-wrap > input:not\(\[type="checkbox"\]\)/);
  assert.doesNotMatch(loginCss, /body \.saas-entry-|body \.auth-(?:screen|card|form-panel|form-heading)|var\(--rf-(?:line|surface|ink|radius-control)\)/);
});
