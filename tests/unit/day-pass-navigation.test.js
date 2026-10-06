'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../public/js/day-passes.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');

test('opening the day-pass ledger does not navigate to the attendance screen', () => {
    const match = source.match(/function openDayPassRecords\(\) \{([\s\S]*?)\n    \}/u);
    assert.ok(match, 'day-pass ledger opener exists');
    assert.match(match[1], /showDayPassDialog\(\{ reset: false \}\)/u);
    assert.doesNotMatch(match[1], /data-page-tab=["']attendance|\.click\(\)/u);
});

test('day-pass dialog is outside the attendance screen section', () => {
    assert.match(
        html,
        /id="attendanceTableWrap"[\s\S]*?<\/section>\s*<dialog id="dayPassDialog"/u,
        'attendance screen closes before the day-pass dialog begins'
    );
});
