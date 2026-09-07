'use strict';

const { TENANT_TYPES } = require('../tenancy/tenant-types');

const BRANCH_STATUS = Object.freeze({
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    ARCHIVED: 'archived'
});

const BRANCH_STATUS_VALUES = Object.freeze(Object.values(BRANCH_STATUS));

const MEMBERSHIP_BRANCH_ACCESS_MODE = Object.freeze({
    SINGLE_BRANCH: 'single_branch',
    SELECTED_BRANCHES: 'selected_branches',
    ALL_BRANCHES: 'all_branches'
});

const MEMBERSHIP_BRANCH_ACCESS_MODE_VALUES = Object.freeze(Object.values(MEMBERSHIP_BRANCH_ACCESS_MODE));

const BRANCH_NULL_SEMANTICS = Object.freeze({
    TENANT_WIDE: 'tenant_wide',
    HISTORICAL_UNATTRIBUTED: 'historical_unattributed'
});

const BRANCH_CAPABILITY = 'branches';

const BRANCH_SECTION_TYPES = Object.freeze({
    MEN: 'men',
    WOMEN: 'women',
    MIXED: 'mixed'
});

const BRANCH_SECTION_TYPE_VALUES = Object.freeze(Object.values(BRANCH_SECTION_TYPES));

function normalizeBranchId(value) {
    if (value === undefined || value === null || value === '') return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeSectionId(value) {
    if (value === undefined || value === null || value === '') return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeBranchSectionType(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return BRANCH_SECTION_TYPE_VALUES.includes(normalized) ? normalized : null;
}

function normalizeBranchStatus(value, fallback = BRANCH_STATUS.ACTIVE) {
    const normalized = String(value || '').trim().toLowerCase();
    return BRANCH_STATUS_VALUES.includes(normalized) ? normalized : fallback;
}

function isGymTenant(tenantType) {
    return String(tenantType || '').trim().toLowerCase() === TENANT_TYPES.GYM;
}

function isActiveBranch(status) {
    return normalizeBranchStatus(status) === BRANCH_STATUS.ACTIVE;
}

function canAcceptNewOperations(status) {
    return normalizeBranchStatus(status) === BRANCH_STATUS.ACTIVE;
}

function normalizeMembershipBranchAccessMode(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return MEMBERSHIP_BRANCH_ACCESS_MODE_VALUES.includes(normalized)
        ? normalized
        : MEMBERSHIP_BRANCH_ACCESS_MODE.SINGLE_BRANCH;
}

function branchCapabilityEnabled({ tenantType, capabilities = {} } = {}) {
    return isGymTenant(tenantType) && capabilities[BRANCH_CAPABILITY] === true;
}

function normalizeBranchContext({ branchId = null, sectionId = null, allBranches = false } = {}) {
    if (allBranches) return { branchId: null, sectionId: null, allBranches: true };
    return { branchId: normalizeBranchId(branchId), sectionId: normalizeSectionId(sectionId), allBranches: false };
}

module.exports = {
    BRANCH_CAPABILITY,
    BRANCH_SECTION_TYPES,
    BRANCH_SECTION_TYPE_VALUES,
    BRANCH_NULL_SEMANTICS,
    BRANCH_STATUS,
    BRANCH_STATUS_VALUES,
    MEMBERSHIP_BRANCH_ACCESS_MODE,
    MEMBERSHIP_BRANCH_ACCESS_MODE_VALUES,
    branchCapabilityEnabled,
    canAcceptNewOperations,
    isActiveBranch,
    isGymTenant,
    normalizeBranchContext,
    normalizeBranchId,
    normalizeSectionId,
    normalizeBranchSectionType,
    normalizeBranchStatus,
    normalizeMembershipBranchAccessMode
};
