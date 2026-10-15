'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('registration page styling is feature-owned and consumes canonical V2 tokens', () => {
    const pageStyles = read('public/css/pages/register-gym.css');
    const tokens = read('public/css/tokens.css');
    const mainStyles = read('public/css/main.source.css');
    const retiredVisualPath = path.join(root, 'public/css/components/visual-redesign.css');
    const legacyVisuals = fs.existsSync(retiredVisualPath) ? fs.readFileSync(retiredVisualPath, 'utf8') : '';

    const tokenDefinitions = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/gu)].map(match => match[1]));
    const tokenReferences = [...new Set([...pageStyles.matchAll(/var\((--[\w-]+)/gu)].map(match => match[1]))];

    assert.ok(tokenReferences.length > 0, 'registration styling must consume the shared token system');
    assert.deepEqual(tokenReferences.filter(token => !tokenDefinitions.has(token)), [], 'all registration tokens must have canonical definitions');
    assert.doesNotMatch(pageStyles, /(?:^|[;{])\s*--[\w-]+\s*:/mu, 'page CSS must not define a competing token source');
    assert.doesNotMatch(pageStyles, /#[\da-f]{3,8}\b|rgba?\(/iu, 'registration colors must come from semantic tokens');
    assert.doesNotMatch(pageStyles, /(?:text-align|margin|padding|border|inset)-(?:left|right)\s*:/iu, 'directional styling must use logical properties');
    assert.match(pageStyles, /\.registration-review-row strong\s*\{[^}]*text-align:\s*end\s*;/su, 'review values must align logically in RTL and LTR');
    assert.match(pageStyles, /\.registration-step-panel\[hidden\]\s*\{\s*display:\s*none\s*;/u, 'wizard hidden-state behavior must remain intact');
    assert.match(mainStyles, /@import url\("\.\/pages\/register-gym\.css"\);/u, 'the canonical page stylesheet must remain in the app entrypoint');
    assert.doesNotMatch(mainStyles, /visual-redesign\.css/u, 'the retired visual layer must not be imported');
    assert.doesNotMatch(legacyVisuals, /\.registration-(?:shell|main|card|steps|actions|type-switch)(?:[\s:#.[,]|$)/u, 'legacy visual layer must not own registration composition');
});
