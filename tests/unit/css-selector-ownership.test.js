'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { hasClassSelector, hasRootClassSelector, rulesContainingClass, rulesWithRootClass, selectorsContainingClass } = require('../helpers/css-selector-ownership');

test('matches exact class selectors with state, descendant, and child combinators', () => {
    const css = `
      .store-tab { color: red; }
      .store-tab.active { color: blue; }
      .store-tab:hover { color: green; }
      .store-tab > * { gap: 1rem; }
      .store-tab .child { display: block; }
    `;

    assert.equal(selectorsContainingClass(css, 'store-tab').length, 5);
    assert.equal(hasClassSelector(css, 'store-tab'), true);
});

test('does not match class-name substrings or similarly prefixed tokens', () => {
    const css = `
      .store-table-wrap { display: block; }
      .store-tabs-wrapper { display: block; }
      .store-tabular { display: block; }
      .my-store-tab-other { display: block; }
    `;

    assert.equal(hasClassSelector(css, 'store-tab'), false);
    assert.equal(selectorsContainingClass(css, 'store-tab').length, 0);
});

test('class-token matching is generic across unrelated component names', () => {
    const css = `
      .dialog-close-button:focus-visible { outline: 2px solid; }
      .dialog-closeable { display: none; }
      .tab-list .tab-button.active { color: blue; }
    `;

    assert.equal(hasClassSelector(css, 'dialog-close-button'), true);
    assert.equal(hasClassSelector(css, 'dialog-close'), false);
    assert.equal(hasClassSelector(css, 'tab-button'), true);
    assert.equal(hasClassSelector(css, 'tab'), false);
});

test('collects component selectors nested under media rules and ignores comments', () => {
    const css = `
      /* .hidden-component { color: red; } */
      @media (max-width: 600px) {
        .responsive-component > .item { display: block; }
      }
    `;

    assert.equal(hasClassSelector(css, 'responsive-component'), true);
    assert.equal(hasClassSelector(css, 'hidden-component'), false);
});

test('distinguishes a component root rule from a valid descendant extension', () => {
    const css = 'body .members-panel h3 { color: red; } .table-wrap:hover { color: blue; }';
    assert.equal(hasRootClassSelector(css, 'members-panel'), false);
    assert.equal(hasRootClassSelector(css, 'table-wrap'), true);
});

test('associates declarations with exact class tokens through nested at-rules', () => {
    const css = '@media (max-width: 600px) { .card-shell:hover { border-radius: 12px; } .card-shelter { color: red; } }';
    const rules = rulesContainingClass(css, 'card-shell');
    assert.equal(rules.length, 1);
    assert.match(rules[0].declarations, /border-radius:\s*12px/u);
    assert.equal(rulesWithRootClass(css, 'card-shell').length, 1);
    assert.equal(rulesWithRootClass(css, 'card-shel').length, 0);
});
