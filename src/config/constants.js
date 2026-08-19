'use strict';

const ROLES = Object.freeze({ OWNER: 'Owner', ASSISTANT: 'Assistant' });
const USER_STATUS = Object.freeze({ ACTIVE: 'Active', DISABLED: 'Disabled' });
const ROLE_PERMISSIONS = Object.freeze({
    [ROLES.OWNER]: Object.freeze(['*']),
    [ROLES.ASSISTANT]: Object.freeze(['members', 'trainees', 'attendance', 'library'])
});

module.exports = { ROLE_PERMISSIONS, ROLES, USER_STATUS };
