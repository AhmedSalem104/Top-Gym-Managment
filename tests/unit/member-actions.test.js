'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../public/js/app.js'), 'utf8');

test('member actions restore the conditional freeze row flow', () => {
    const rowStart = source.indexOf('function memberTableRow(member)');
    const rowEnd = source.indexOf('function renderMembers()', rowStart);
    assert.ok(rowStart >= 0 && rowEnd > rowStart, 'member row renderer must remain discoverable');

    const rowSource = source.slice(rowStart, rowEnd);
    assert.doesNotMatch(rowSource, /const freezeUnavailable\s*=/u);
    assert.match(rowSource, /actionButton\(\s*'freeze',\s*member\.id/u);
    assert.match(rowSource, /const freezeButton\s*=\s*sub\.status === 'frozen'/u);
    assert.match(rowSource, /sub\.status === 'expired'\s*\n?\s*\? ''/u);
    assert.match(rowSource, /freezeCount >= freezeLimit \? 'disabled' : ''/u);
    assert.match(source, /querySelectorAll\('\[data-action="freeze"\], \[data-action="payment"\]'\)/u);
    assert.match(source, /if \(action === 'freeze' \|\| action === 'renew' \|\| action === 'payment'\)/u);
});
