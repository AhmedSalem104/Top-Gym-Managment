'use strict';

const { getTenantContext } = require('../tenancy/tenant-context');
const { normalizeBranchContext, normalizeBranchId, normalizeSectionId } = require('./branch-contract');

function requestedBranchContext(request = {}) {
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const query = request.query && typeof request.query === 'object' ? request.query : {};
    const header = typeof request.get === 'function' ? request.get('x-branch-id') : null;
    const sectionHeader = typeof request.get === 'function' ? request.get('x-section-id') : null;
    const branchId = header ?? query.branchId ?? body.branchId ?? null;
    const sectionId = sectionHeader ?? query.sectionId ?? body.sectionId ?? null;
    const allBranches = String(query.allBranches ?? body.allBranches ?? '').trim().toLowerCase() === 'true';
    return normalizeBranchContext({ branchId, sectionId, allBranches });
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
        return { branch: null, branchId: null, section: null, sectionId: null, allBranches: false, branches: [], sections: [] };
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
        if (requested.sectionId) {
            const error = new Error('Select a single branch before selecting a section.');
            error.statusCode = 400;
            error.expose = true;
            error.code = 'SECTION_REQUIRES_SINGLE_BRANCH';
            throw error;
        }
        return { branch: null, branchId: null, section: null, sectionId: null, allBranches: true, branches, sections: [] };
    }
    if (requested.branchId) {
        const branch = await branchService.assertBranchAccess(requested.branchId, {
            userId: request.auth.id,
            role: request.auth.role,
            requireActive: required
        });
        const sections = await branchService.getBranchSections(branch.id, { userId: request.auth.id, role: request.auth.role });
        let section = null;
        if (requested.sectionId) {
            section = await branchService.assertSectionAccess(requested.sectionId, branch.id, { userId: request.auth.id, role: request.auth.role });
        }
        return { branch, branchId: branch.id, section, sectionId: section?.id || null, allBranches: false, branches, sections };
    }
    if (requested.sectionId) {
        const error = new Error('Select a branch before selecting a section.');
        error.statusCode = 400;
        error.expose = true;
        error.code = 'SECTION_REQUIRES_BRANCH';
        throw error;
    }
    if (branches.length === 1) {
        const sections = await branchService.getBranchSections(branches[0].id, { userId: request.auth.id, role: request.auth.role });
        return { branch: branches[0], branchId: branches[0].id, section: null, sectionId: null, allBranches: false, branches, sections };
    }
    if (required) {
        const error = new Error('Select a branch before continuing.');
        error.statusCode = 409;
        error.expose = true;
        error.code = 'BRANCH_CONTEXT_REQUIRED';
        throw error;
    }
    return { branch: null, branchId: null, section: null, sectionId: null, allBranches: false, branches, sections: [] };
}

function branchIdFromRequest(request = {}) {
    return normalizeBranchId(requestedBranchContext(request).branchId);
}

function sectionIdFromRequest(request = {}) {
    return normalizeSectionId(requestedBranchContext(request).sectionId);
}

module.exports = { branchIdFromRequest, sectionIdFromRequest, requestedBranchContext, resolveBranchContext };
