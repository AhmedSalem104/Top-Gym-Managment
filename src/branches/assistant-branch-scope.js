'use strict';

function scopeError(message, statusCode, code) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    return error;
}

function resolveAssistantBranchIds(requestedBranchIds, activeBranches = []) {
    const branches = Array.isArray(activeBranches) ? activeBranches : [];
    const activeIds = new Set(branches.map((branch) => Number(branch.id)).filter((id) => Number.isSafeInteger(id) && id > 0));
    if (!activeIds.size) {
        throw scopeError('An active branch is required before an assistant can be created.', 409, 'ACTIVE_BRANCH_REQUIRED');
    }

    if (requestedBranchIds === undefined) {
        const defaultBranch = branches.find((branch) => branch.is_main_branch === true || branch.is_main_branch === 1 || branch.isMain === true || branch.isMain === 1);
        const defaultId = Number(defaultBranch?.id);
        return [activeIds.has(defaultId) ? defaultId : activeIds.values().next().value];
    }

    if (!Array.isArray(requestedBranchIds) || requestedBranchIds.length === 0) {
        throw scopeError('Select at least one active branch for this assistant.', 400, 'ASSISTANT_BRANCH_REQUIRED');
    }
    if (requestedBranchIds.length > activeIds.size) {
        throw scopeError('The selected branch scope is invalid.', 400, 'BRANCH_SCOPE_INVALID');
    }

    const ids = requestedBranchIds.map((value) => {
        if (!(typeof value === 'number' || typeof value === 'string') || !/^\d+$/u.test(String(value))) {
            throw scopeError('One or more selected branches are invalid.', 400, 'BRANCH_SCOPE_INVALID');
        }
        const id = Number(value);
        if (!Number.isSafeInteger(id) || id <= 0 || !activeIds.has(id)) {
            throw scopeError('One or more selected branches are not active in this Gym.', 400, 'BRANCH_SCOPE_INVALID');
        }
        return id;
    });

    if (new Set(ids).size !== ids.length) {
        throw scopeError('A branch can only be selected once.', 400, 'BRANCH_SCOPE_INVALID');
    }
    return ids;
}

module.exports = { resolveAssistantBranchIds };
