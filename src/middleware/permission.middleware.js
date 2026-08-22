'use strict';

const { ROLES } = require('../permissions/roles');
const { hasPermission } = require('../permissions/permissions');
const { permissionForRequest } = require('../permissions/route-permissions');

function requirementSatisfied(user, requirement) {
    if (!user || !requirement) return false;
    if (user.role === ROLES.OWNER) return true;
    if (requirement.ownerOnly) return false;
    return (requirement.all || []).every((permission) => hasPermission(user, permission));
}

function authorizeRequest(user, request) {
    return requirementSatisfied(user, permissionForRequest(request));
}

function requirePermission(permission, options = {}) {
    const required = Array.isArray(permission) ? permission : [permission];
    return (request, response, next) => {
        const user = request.auth;
        const ownerOnly = Boolean(options.ownerOnly);
        const allowed = user?.role === ROLES.OWNER
            || (!ownerOnly && required.every((code) => hasPermission(user, code)));
        if (!allowed) {
            return response.status(403).json({
                error: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
                code: ownerOnly ? 'OWNER_REQUIRED' : 'FORBIDDEN',
                permission: required.length === 1 ? required[0] : required
            });
        }
        return next();
    };
}

module.exports = { authorizeRequest, requirementSatisfied, requirePermission };
