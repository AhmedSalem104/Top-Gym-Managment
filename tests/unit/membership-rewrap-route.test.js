'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');

test('membership rewrap maintenance path is explicitly gated and resumable', () => {
    assert.match(source, /app\.post\('\/api\/internal\/maintenance\/membership-rewrap'/u);
    assert.match(source, /MEMBERSHIP_REWRAP_JOB_ENABLED !== 'true'/u);
    assert.match(source, /crypto\.timingSafeEqual/u);
    assert.match(source, /membership_code_revoked_at IS NULL/u);
    assert.match(source, /membershipCodeService\.rewrapMemberCodeIfPrevious/u);
    assert.match(source, /nextAfterId/u);
    assert.match(source, /limit = Math\.min\(25/u);
});

test('rewrap response contains aggregate progress only', () => {
    assert.doesNotMatch(source, /response\.json\(\{[^}]*membership_code_(?:hash|ciphertext)/isu);
    assert.doesNotMatch(source, /console\.log\([^\n]*membership_code_(?:hash|ciphertext)/iu);
});
