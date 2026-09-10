'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../public/js/app.js'), 'utf8');

test('member actions keep freeze visible as a stable row action', () => {
    const rowStart = source.indexOf('function memberTableRow(member)');
    const rowEnd = source.indexOf('function renderMembers()', rowStart);
    assert.ok(rowStart >= 0 && rowEnd > rowStart, 'member row renderer must remain discoverable');

    const rowSource = source.slice(rowStart, rowEnd);
    assert.match(rowSource, /const freezeUnavailable\s*=\s*\['cancelled',\s*'expired',\s*'frozen'\]/u);
    assert.match(rowSource, /actionButton\(\s*'freeze',\s*member\.id/u);
    assert.match(rowSource, /const resumeButton\s*=\s*sub\.status === 'frozen'/u);
    assert.match(source, /if \(action === 'freeze' \|\| action === 'renew' \|\| action === 'payment'\)/u);
});
