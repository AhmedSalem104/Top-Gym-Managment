'use strict';

const { ROLES } = require('./roles');
const { hasPermission, permissionsForRole: defaultPermissionsForRole } = require('./permissions');
const { permissionForRequest } = require('./route-permissions');

const ROLE_PERMISSIONS = Object.freeze({
    [ROLES.OWNER]: Object.freeze(['*']),
    [ROLES.ASSISTANT]: Object.freeze(['members', 'trainees', 'attendance', 'library']),
    [ROLES.PLATFORM_ADMIN]: Object.freeze(['*'])
});

const ASSISTANT_ROUTE_RULES = Object.freeze([
    { pattern: /^\/pricing(?:\/|$)/, methods: Object.freeze(['GET']) },
    { pattern: /^\/day-passes\/pricing(?:\/|$)/, methods: Object.freeze(['GET']) },
    { pattern: /^\/day-passes(?:\/|$)/ },
    { pattern: /^\/members(?:\/|$)/ },
    { pattern: /^\/memberships(?:\/|$)/ },
    { pattern: /^\/external-trainees(?:\/|$)/ },
    { pattern: /^\/coaching(?:\/|$)/ },
    { pattern: /^\/clients(?:\/|$)/ },
    { pattern: /^\/workoutprograms(?:\/|$)/ },
    { pattern: /^\/workout-programs(?:\/|$)/ },
    { pattern: /^\/dietplans(?:\/|$)/ },
    { pattern: /^\/diet-plans(?:\/|$)/ },
    { pattern: /^\/workoutsessions(?:\/|$)/ },
    { pattern: /^\/meal-logs(?:\/|$)/ },
    { pattern: /^\/attendance(?:\/|$)/ },
    { pattern: /^\/library(?:\/|$)/ }
]);

function assistantPathAllowed(request) {
    const path = String(request.path || '');
    const method = String(request.method || 'GET').toUpperCase();
    return ASSISTANT_ROUTE_RULES.some(({ pattern, methods }) => pattern.test(path) && (!methods || methods.includes(method)));
}

function permissionsForRole(role) {
    if (role === ROLES.OWNER || role === ROLES.PLATFORM_ADMIN) return ['*'];
    return defaultPermissionsForRole(role);
}

function canAccessRoleRequest(user, request) {
    if (!user) return false;
    if (user.role === ROLES.OWNER) return true;
    if (user.role === ROLES.PLATFORM_ADMIN) return false;
    if (user.role !== ROLES.ASSISTANT) return false;
    const requirement = permissionForRequest(request);
    if (!requirement || requirement.ownerOnly) return false;
    return requirement.all.every((permission) => hasPermission(user, permission));
}

module.exports = {
    ASSISTANT_ROUTE_RULES,
    ROLE_PERMISSIONS,
    assistantPathAllowed,
    canAccessRoleRequest,
    permissionsForRole
};
