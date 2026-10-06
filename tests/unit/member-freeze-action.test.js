'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../public/js/app.js'), 'utf8');

function loadMemberActionsMarkup() {
    const start = source.indexOf('function memberActionsMarkup(member)');
    const end = source.indexOf('\n        function memberMobileCard', start);
    assert.ok(start >= 0 && end > start, 'shared member actions renderer must remain discoverable');

    return new Function(
        'FREEZE_LIMIT',
        'actionButton',
        `${source.slice(start, end)}; return memberActionsMarkup;`
    )(
        3,
        (action, memberId) => `<button data-action="${action}" data-id="${memberId}"></button>`
    );
}

function memberWithStatus(status, freezeCount = 0) {
    return {
        id: 42,
        fullName: 'QA member',
        phone: '0000000000',
        registrationDate: '2026-01-01',
        membership: {
            status,
            freezeCount,
            freezeLimit: 3,
            plan: 'gym_only',
            type: 'monthly',
            effectiveEndDate: '2026-12-31',
            daysRemaining: 100,
            amountDue: 0,
            amountRemaining: 0
        }
    };
}

test('eligible subscriptions render the freeze action', () => {
    const renderMemberActions = loadMemberActionsMarkup();

    for (const status of ['active', 'expiring_soon']) {
        const html = renderMemberActions(memberWithStatus(status));
        assert.match(html, /data-action="freeze" data-id="42"\s*><\/button>/, `${status} membership should be freezeable`);
    }
});

test('freeze action is absent when the usage limit is reached and for expired memberships', () => {
    const renderMemberActions = loadMemberActionsMarkup();
    const enabled = renderMemberActions(memberWithStatus('active', 0));
    const limitReached = renderMemberActions(memberWithStatus('active', 3));
    const expired = renderMemberActions(memberWithStatus('expired', 0));

    assert.match(enabled, /data-action="freeze" data-id="42"\s*><\/button>/);
    assert.doesNotMatch(limitReached, /data-action="freeze"/);
    assert.doesNotMatch(expired, /data-action="freeze"/);
});

test('frozen memberships show resume instead of freeze', () => {
    const html = loadMemberActionsMarkup()(memberWithStatus('frozen', 1));

    assert.doesNotMatch(html, /data-action="freeze"/);
    assert.match(html, /data-action="resume" data-id="42"/);
});

test('members without a subscription do not receive a freeze action', () => {
    const renderMemberActions = loadMemberActionsMarkup();
    const html = renderMemberActions({
        id: 42,
        fullName: 'QA member',
        phone: '0000000000',
        registrationDate: '2026-01-01',
        membership: null
    });

    assert.doesNotMatch(html, /data-action="freeze"/);
});

test('member quick-action decoration removes freeze and payment for cancelled memberships', () => {
    assert.match(
        source,
        /querySelectorAll\('\[data-action="freeze"\], \[data-action="payment"\]'\)/,
        'cancelled memberships must not expose freeze or payment actions'
    );
});
