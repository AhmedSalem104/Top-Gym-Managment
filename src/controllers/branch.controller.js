'use strict';

function createBranchController({ branchService }) {
    const meta = (request) => ({ actorUserId: request.auth?.id, role: request.auth?.role, request });
    return {
        list: async (request, response) => response.json({ branches: await branchService.getAllowedBranches({ userId: request.auth?.id, role: request.auth?.role, includeArchived: request.query.includeArchived === 'true' }) }),
        bootstrap: async (request, response) => response.json(await branchService.bootstrap({ userId: request.auth?.id, role: request.auth?.role })),
        create: async (request, response) => response.status(201).json({ branch: await branchService.createBranch(request.body || {}, meta(request)) }),
        update: async (request, response) => response.json({ branch: await branchService.updateBranch(request.params.id, request.body || {}, meta(request)) }),
        archive: async (request, response) => response.json({ branch: await branchService.archiveBranch(request.params.id, meta(request)) }),
        access: async (request, response) => response.json({ branches: await branchService.getUserBranchAccess(request.params.userId, { actorUserId: request.auth?.id, role: request.auth?.role }) }),
        assignAccess: async (request, response) => response.json({ branches: await branchService.assignUserBranches(request.params.userId, request.body?.branchIds, meta(request)) })
    };
}

module.exports = { createBranchController };
