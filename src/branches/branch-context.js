'use strict';

const { getTenantContext } = require('../tenancy/tenant-context');
const { normalizeBranchContext, normalizeBranchId } = require('./branch-contract');

function requestedBranchContext(request = {}) {
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const query = request.query && typeof request.query === 'object' ? request.query : {};
    const header = typeof request.get === 'function' ? request.get('x-branch-id') : null;
    const branchId = header ?? query.branchId ?? body.branchId ?? null;
    const allBranches = String(query.allBranches ?? body.allBranches ?? '').trim().toLowerCase() === 'true';
    return normalizeBranchContext({ branchId, allBranches });
}

async function resolveBranchContext(request, { branchService, required = false, allowAll = false } = {}) {
    const context = getTenantContext() || {};
    if (!request?.auth || context.mode !== 'tenant') {
        if (required) {
            const error = new Error('A Gym branch context is required for this operation.');
            error.statusCode = 403;
            error.expose = true;
            error.code = 'BRANCH_CONTEXT_REQUIRED';
            throw error;
        }
        return { branch: null, branchId: null, allBranches: false, branches: [] };
    }
    if (!branchService) throw new Error('Branch service is unavailable.');
    const requested = requestedBranchContext(request);
    const branches = await branchService.getAllowedBranches({ userId: request.auth.id, role: request.auth.role });
    if (requested.allBranches) {
        if (!allowAll || request.auth.role !== 'Owner') {
            const error = new Error('All-branch context is not available for this operation.');
            error.statusCode = 403;
            error.expose = true;
            error.code = 'ALL_BRANCHES_NOT_ALLOWED';
            throw error;
        }
        return { branch: null, branchId: null, allBranches: true, branches };
    }
    if (requested.branchId) {
        const branch = await branchService.assertBranchAccess(requested.branchId, {
            userId: request.auth.id,
            role: request.auth.role,
            requireActive: required
        });
        return { branch, branchId: branch.id, allBranches: false, branches };
    }
    if (branches.length === 1) return { branch: branches[0], branchId: branches[0].id, allBranches: false, branches };
    if (required) {
        const error = new Error('Select a branch before continuing.');
        error.statusCode = 409;
        error.expose = true;
        error.code = 'BRANCH_CONTEXT_REQUIRED';
        throw error;
    }
    return { branch: null, branchId: null, allBranches: false, branches };
}

function branchIdFromRequest(request = {}) {
    return normalizeBranchId(requestedBranchContext(request).branchId);
}

module.exports = { branchIdFromRequest, requestedBranchContext, resolveBranchContext };
