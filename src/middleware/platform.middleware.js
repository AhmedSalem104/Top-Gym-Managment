'use strict';

const { ROLES } = require('../permissions/roles');

function platformOnly(request, response, next) {
    if (request.auth?.role !== ROLES.PLATFORM_ADMIN) {
        return response.status(403).json({
            error: 'هذه العملية متاحة لمدير المنصة فقط.',
            code: 'PLATFORM_ADMIN_REQUIRED'
        });
    }
    return next();
}

module.exports = { platformOnly };
