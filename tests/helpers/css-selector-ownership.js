'use strict';

function collectCssRules(source) {
    const css = String(source).replace(/\/\*[\s\S]*?\*\//gu, '');
    const rules = [];
    const stack = [];
    let buffer = '';
    for (let index = 0; index < css.length; index += 1) {
        const character = css[index];
        if (character === '{') {
            const prelude = buffer.trim();
            stack.push({ prelude, openingIndex: index });
            buffer = '';
        } else if (character === '}') {
            const rule = stack.pop();
            if (rule?.prelude && !rule.prelude.startsWith('@')) {
                rules.push({ selector: rule.prelude, declarations: css.slice(rule.openingIndex + 1, index).trim() });
            }
            buffer = '';
        } else if (character === ';') {
            buffer = '';
        } else {
            buffer += character;
        }
    }

    return rules;
}

function collectCssSelectors(source) {
    return collectCssRules(source).map(rule => rule.selector);
}

function classNamesInSelector(selector) {
    const names = [];
    const classPattern = /\.((?:\\[\da-fA-F]{1,6}\s?|\\.|[\p{L}\p{N}_-])+)/gu;

    for (const match of selector.matchAll(classPattern)) {
        names.push(match[1]);
    }

    return names;
}

function selectorsContainingClass(source, className) {
    if (typeof className !== 'string' || className.length === 0) {
        throw new TypeError('className must be a non-empty string');
    }

    return collectCssSelectors(source).filter(selector => classNamesInSelector(selector).includes(className));
}

function hasClassSelector(source, className) {
    return selectorsContainingClass(source, className).length > 0;
}

function hasRootClassSelector(source, className) {
    const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const rootPattern = new RegExp(`(?:^|,)\\s*(?:(?:html|body)(?:\\[[^\\]]+\\])?\\s+)*\\.${escapedClass}(?=:(?!:)|[.#\\[]|\\s*[,{}]|$)`, 'u');
    return collectCssSelectors(source).some(selector => rootPattern.test(selector));
}

function rulesContainingClass(source, className) {
    return collectCssRules(source).filter(rule => classNamesInSelector(rule.selector).includes(className));
}

function rulesWithRootClass(source, className) {
    const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const rootPattern = new RegExp(`(?:^|,)\\s*(?:(?:html|body)(?:\\[[^\\]]+\\])?\\s+)*\\.${escapedClass}(?=:(?!:)|[.#\\[]|\\s*[,{}]|$)`, 'u');
    return collectCssRules(source).filter(rule => rootPattern.test(rule.selector));
}

module.exports = { collectCssRules, collectCssSelectors, classNamesInSelector, hasClassSelector, hasRootClassSelector, rulesContainingClass, rulesWithRootClass, selectorsContainingClass };
