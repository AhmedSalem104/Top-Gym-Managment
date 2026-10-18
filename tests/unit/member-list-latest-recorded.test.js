'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('member list has a deterministic latest-record projection while retaining the operational membership selection', () => {
    const repository = read('src/repositories/member.repository.js');
    const service = read('src/services/member-service.js');
    const app = read('public/js/app.js');

    assert.match(repository, /ROW_NUMBER\(\) OVER \(PARTITION BY m\.member_id ORDER BY m\.created_at DESC, m\.id DESC\) AS latestRecordedRank/u);
    assert.match(repository, /recorded\.latestRecordedRank = 1/u);
    assert.match(repository, /recorded\.membershipPlan AS latestRecordedMembershipPlan[\s\S]*?recorded\.membershipType AS latestRecordedMembershipType[\s\S]*?recorded\.startDate AS latestRecordedStartDate[\s\S]*?recorded\.endDate AS latestRecordedEndDate/u);
    assert.match(repository, /ISNULL\(recordedPayment\.amountPaid, 0\) AS latestRecordedAmountPaid[\s\S]*?ISNULL\(recordedPayment\.amountRemaining, 0\) AS latestRecordedAmountRemaining/u);
    assert.match(service, /membership: membershipId \? \{[\s\S]*?latestRecordedMembership: latestRecordedMembershipId \? \{/u);
    assert.match(app, /function displayedMembership\(member\) \{ return member\.latestRecordedMembership \?\? member\.membership \?\? null; \}/u);
    assert.match(app, /function memberActionsMarkup\(member\) \{\s*const sub = member\.membership;/u);
});

test('member list presentation formats date-only values as ASCII DD/MM/YYYY without timezone parsing', () => {
    const app = read('public/js/app.js');
    const helper = app.slice(app.indexOf('function membersDateDmy'), app.indexOf('function displayedMembership'));
    assert.match(helper, /match\[3\].*match\[2\].*match\[1\]/u);
    assert.doesNotMatch(helper, /new Date|Intl\.DateTimeFormat/u);
    assert.match(app, /<time dir="ltr"[\s\S]*?datetime=/u);
});
