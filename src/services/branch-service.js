'use strict';

const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');
const { currentTenantId, getTenantContext } = require('../tenancy/tenant-context');
const { TENANT_TYPES } = require('../tenancy/tenant-types');
const { BRANCH_STATUS, canAcceptNewOperations, normalizeBranchId, normalizeSectionId, normalizeBranchStatus, normalizeMembershipBranchAccessMode, MEMBERSHIP_BRANCH_ACCESS_MODE } = require('../branches/branch-contract');
const saasService = require('./saas-service');
const cacheService = require('./cache-service');

function branchError(message, statusCode = 400, code = 'BRANCH_ERROR') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    return error;
}

function tenantId() {
    return currentTenantId({ required: true });
}

function idValue(value, label = 'Branch id') {
    const id = normalizeBranchId(value);
    if (!id) throw branchError(`${label} is invalid.`, 400, 'INVALID_BRANCH_ID');
    return id;
}

function textValue(value, label, maxLength, required = false) {
    const valueText = String(value ?? '').trim();
    if (required && !valueText) throw branchError(`${label} is required.`, 400, 'BRANCH_FIELD_REQUIRED');
    if (valueText.length > maxLength) throw branchError(`${label} is too long.`, 400, 'BRANCH_FIELD_TOO_LONG');
    return valueText || null;
}

function booleanValue(value, fallback) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'boolean') return value;
    if (value === 1 || ['true', 'yes', 'on', '1'].includes(String(value).trim().toLowerCase())) return true;
    if (value === 0 || ['false', 'no', 'off', '0'].includes(String(value).trim().toLowerCase())) return false;
    throw branchError('Commerce setting is invalid.', 400, 'BRANCH_COMMERCE_SETTING_INVALID');
}

async function ensureBranchCommerceDefaults(transaction, { tenantId: currentTenantId, branchId, storeEnabled = true, barEnabled = false, actorUserId = null } = {}) {
    await transaction.request()
        .input('tenantId', sql.Int, currentTenantId)
        .input('branchId', sql.Int, branchId)
        .input('storeEnabled', sql.Bit, storeEnabled ? 1 : 0)
        .input('barEnabled', sql.Bit, barEnabled ? 1 : 0)
        .input('actor', sql.Int, actorUserId == null ? null : Number(actorUserId))
        .query(`
            MERGE dbo.gym_branch_commerce_config AS target
            USING (SELECT @tenantId AS tenant_id, @branchId AS branch_id) AS source
              ON target.tenant_id=source.tenant_id AND target.branch_id=source.branch_id
            WHEN MATCHED THEN UPDATE SET store_enabled=@storeEnabled,bar_enabled=@barEnabled,updated_at=SYSUTCDATETIME()
            WHEN NOT MATCHED THEN INSERT (tenant_id,branch_id,store_enabled,bar_enabled) VALUES (@tenantId,@branchId,@storeEnabled,@barEnabled);

            IF @storeEnabled=1 AND NOT EXISTS (SELECT 1 FROM dbo.gym_stock_locations WHERE tenant_id=@tenantId AND branch_id=@branchId AND location_code='main-store')
                INSERT INTO dbo.gym_stock_locations(tenant_id,branch_id,location_code,name,location_type,created_by_user_id)
                VALUES (@tenantId,@branchId,'main-store',N'Main Store','store',@actor);

            IF @barEnabled=1 AND NOT EXISTS (SELECT 1 FROM dbo.gym_stock_locations WHERE tenant_id=@tenantId AND branch_id=@branchId AND location_code='main-bar')
                INSERT INTO dbo.gym_stock_locations(tenant_id,branch_id,location_code,name,location_type,created_by_user_id)
                VALUES (@tenantId,@branchId,'main-bar',N'Main Bar','bar',@actor);
        `);
}

function branchDto(row) {
    return {
        id: Number(row.id),
        tenantId: Number(row.tenant_id),
        code: String(row.branch_code || ''),
        name: String(row.name || ''),
        address: row.address || null,
        phone: row.phone || null,
        workingHours: row.working_hours_json ? safeJson(row.working_hours_json) : null,
        status: normalizeBranchStatus(row.status),
        isMain: Boolean(row.is_main_branch),
        storeEnabled: row.store_enabled == null ? true : Boolean(row.store_enabled),
        barEnabled: row.bar_enabled == null ? false : Boolean(row.bar_enabled),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function sectionDto(row) {
    return {
        id: Number(row.id),
        tenantId: Number(row.tenant_id),
        branchId: Number(row.branch_id),
        code: String(row.section_code || ''),
        name: String(row.name || ''),
        type: String(row.section_type || 'mixed'),
        active: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function safeJson(value) {
    try { return JSON.parse(String(value)); } catch (_) { return null; }
}

function assertGymTenantRow(row, id) {
    if (!row) throw branchError('Tenant was not found.', 404, 'TENANT_NOT_FOUND');
    if (String(row.tenant_type || '').toLowerCase() !== TENANT_TYPES.GYM) {
        throw branchError('Branches are available for Gym tenants only.', 403, 'BRANCHES_GYM_ONLY');
    }
    return { tenantId: id, status: String(row.status || '') };
}

async function assertGymTenant() {
    const id = tenantId();
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, id)
        .query('SELECT TOP (1) tenant_type,status FROM dbo.gym_tenants WHERE id=@tenantId;'));
    return assertGymTenantRow(result.recordset[0], id);
}

async function getBranch(branchId, { includeArchived = false, requireActive = false } = {}) {
    const id = idValue(branchId);
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, tenantId())
        .input('branchId', sql.Int, id)
        .input('includeArchived', sql.Bit, includeArchived ? 1 : 0)
        .query(`SELECT TOP (1) tenant_type,status FROM dbo.gym_tenants WHERE id=@tenantId;

                SELECT b.*,c.store_enabled,c.bar_enabled
                FROM dbo.gym_branches b
                LEFT JOIN dbo.gym_branch_commerce_config c ON c.branch_id=b.id AND c.tenant_id=b.tenant_id
                WHERE b.tenant_id=@tenantId AND b.id=@branchId
                  AND (@includeArchived=1 OR b.status<>'archived');`));
    const tenant = assertGymTenantRow(result.recordsets?.[0]?.[0], tenantId());
    const row = result.recordsets?.[1]?.[0];
    if (!row) throw branchError('Branch was not found.', 404, 'BRANCH_NOT_FOUND');
    if (requireActive && !canAcceptNewOperations(row.status)) {
        throw branchError('This branch is not active for new operations.', 409, 'BRANCH_NOT_ACTIVE');
    }
    return branchDto(row);
}

async function listBranches({ includeArchived = false, includeInactive = true } = {}) {
    const id = tenantId();
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, id)
        .input('includeArchived', sql.Bit, includeArchived ? 1 : 0)
        .input('includeInactive', sql.Bit, includeInactive ? 1 : 0)
        .query(`SELECT TOP (1) tenant_type,status FROM dbo.gym_tenants WHERE id=@tenantId;

                SELECT b.*,c.store_enabled,c.bar_enabled
                FROM dbo.gym_branches b
                LEFT JOIN dbo.gym_branch_commerce_config c ON c.branch_id=b.id AND c.tenant_id=b.tenant_id
                WHERE b.tenant_id=@tenantId
                  AND (@includeArchived=1 OR b.status<>'archived')
                  AND (@includeInactive=1 OR b.status='active')
                ORDER BY b.is_main_branch DESC,b.status,b.name,b.id;`));
    assertGymTenantRow(result.recordsets?.[0]?.[0], id);
    return (result.recordsets?.[1] || []).map(branchDto);
}

async function getAllowedBranches({ userId = null, role = null, includeArchived = false } = {}) {
    const id = tenantId();
    const user = Number(userId);
    const isOwner = String(role || '').toLowerCase() === 'owner';
    if (!isOwner && (!Number.isInteger(user) || user <= 0)) return [];
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, id)
        .input('userId', sql.Int, user)
        .input('isOwner', sql.Bit, isOwner ? 1 : 0)
        .input('includeArchived', sql.Bit, includeArchived ? 1 : 0)
        .input('includeInactive', sql.Bit, includeArchived ? 0 : 1)
        .query(`SELECT TOP (1) tenant_type,status FROM dbo.gym_tenants WHERE id=@tenantId;

                SELECT b.*,c.store_enabled,c.bar_enabled
                FROM dbo.gym_branches AS b
                LEFT JOIN dbo.gym_branch_commerce_config AS c
                  ON c.branch_id=b.id AND c.tenant_id=b.tenant_id
                WHERE b.tenant_id=@tenantId
                  AND (@includeArchived=1 OR b.status<>'archived')
                  AND (@includeInactive=1 OR b.status='active')
                  AND (@isOwner=1 OR EXISTS (
                      SELECT 1
                      FROM dbo.gym_branch_user_access AS a
                      WHERE a.tenant_id=b.tenant_id
                        AND a.branch_id=b.id
                        AND a.user_id=@userId
                  ))
                ORDER BY b.is_main_branch DESC,b.status,b.name,b.id;`));
    assertGymTenantRow(result.recordsets?.[0]?.[0], id);
    return (result.recordsets?.[1] || []).map(branchDto);
}

async function assertBranchAccess(branchId, { userId = null, role = null, requireActive = true } = {}) {
    const branch = await getBranch(branchId, { requireActive });
    if (String(role || '').toLowerCase() === 'owner') return branch;
    const user = Number(userId);
    if (!Number.isInteger(user) || user <= 0) throw branchError('Branch access is required.', 403, 'BRANCH_ACCESS_REQUIRED');
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, tenantId())
        .input('branchId', sql.Int, branch.id)
        .input('userId', sql.Int, user)
        .query(`SELECT TOP (1) 1 AS allowed
                FROM dbo.gym_branch_user_access
                WHERE tenant_id=@tenantId AND branch_id=@branchId AND user_id=@userId;`));
    if (!result.recordset[0]) throw branchError('You do not have access to this branch.', 403, 'BRANCH_ACCESS_DENIED');
    return branch;
}

async function getBranchSections(branchId, { userId = null, role = null, includeInactive = false } = {}) {
    const id = idValue(branchId);
    const currentTenant = tenantId();
    const user = Number(userId);
    const isOwner = String(role || '').toLowerCase() === 'owner';
    if (!isOwner && (!Number.isInteger(user) || user <= 0)) {
        throw branchError('Branch access is required.', 403, 'BRANCH_ACCESS_REQUIRED');
    }

    // Keep the authorization boundary, but resolve tenant, branch existence,
    // and delegated branch access in one read. Previously this path called
    // assertGymTenant -> getBranch -> access check before the section cache,
    // repeating the same scope reads for every dashboard/bootstrap request.
    const authorization = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, currentTenant)
        .input('branchId', sql.Int, id)
        .input('userId', sql.Int, isOwner ? null : user)
        .input('isOwner', sql.Bit, isOwner ? 1 : 0)
        .query(`
            SELECT TOP (1)
                   t.tenant_type,
                   b.id AS branch_id,
                   b.tenant_id,
                   b.status AS branch_status,
                   CASE WHEN @isOwner=1 THEN 1
                        WHEN EXISTS (
                            SELECT 1
                            FROM dbo.gym_branch_user_access AS a
                            WHERE a.tenant_id=b.tenant_id
                              AND a.branch_id=b.id
                              AND a.user_id=@userId
                        ) THEN 1
                        ELSE 0 END AS branch_allowed
            FROM dbo.gym_tenants AS t
            LEFT JOIN dbo.gym_branches AS b
              ON b.tenant_id=t.id
             AND b.id=@branchId
             AND b.status<>'archived'
            WHERE t.id=@tenantId;
        `));
    const authorizationRow = authorization.recordset[0];
    if (!authorizationRow) throw branchError('Tenant was not found.', 404, 'TENANT_NOT_FOUND');
    if (String(authorizationRow.tenant_type || '').toLowerCase() !== TENANT_TYPES.GYM) {
        throw branchError('Branches are available for Gym tenants only.', 403, 'BRANCHES_GYM_ONLY');
    }
    if (!authorizationRow.branch_id) throw branchError('Branch was not found.', 404, 'BRANCH_NOT_FOUND');
    if (!Number(authorizationRow.branch_allowed)) {
        throw branchError('You do not have access to this branch.', 403, 'BRANCH_ACCESS_DENIED');
    }

    const branch = {
        id: Number(authorizationRow.branch_id),
        tenantId: Number(authorizationRow.tenant_id),
        status: authorizationRow.branch_status
    };
    return getSectionsForAuthorizedBranch(branch, { includeInactive });
}

async function getSectionsForAuthorizedBranch(branch, { includeInactive = false } = {}) {
    // This helper is only called with a branch that has already passed the
    // current request's getAllowedBranches authorization query. Keeping the
    // authorization boundary in getBranchSections preserves the public
    // contract; bootstrap can safely reuse that already-authorized result
    // instead of re-querying access once per branch.
    const cacheKey = cacheService.tenantKey({ tenantId: branch.tenantId, resource: 'sections', scope: { branchId: branch.id, includeInactive: includeInactive ? 1 : 0 } });
    const cached = await cacheService.get(cacheKey);
    if (Array.isArray(cached)) return cached;
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, branch.tenantId)
        .input('branchId', sql.Int, branch.id)
        .input('includeInactive', sql.Bit, includeInactive ? 1 : 0)
        .query(`SELECT id,tenant_id,branch_id,section_code,name,section_type,is_active,created_at,updated_at
                FROM dbo.gym_branch_sections
                WHERE tenant_id=@tenantId AND branch_id=@branchId
                  AND (@includeInactive=1 OR is_active=1)
                ORDER BY CASE section_type WHEN 'men' THEN 1 WHEN 'women' THEN 2 WHEN 'mixed' THEN 3 ELSE 4 END, name, id;`));
    const sections = result.recordset.map(sectionDto);
    await cacheService.set(cacheKey, sections, 30);
    return sections;
}

async function invalidateBranchSectionCache(branchId, currentTenant = tenantId()) {
    const id = normalizeBranchId(branchId);
    if (!id) return;
    await cacheService.deleteMany([
        cacheService.tenantKey({ tenantId: currentTenant, resource: 'sections', scope: { branchId: id, includeInactive: 0 } }),
        cacheService.tenantKey({ tenantId: currentTenant, resource: 'sections', scope: { branchId: id, includeInactive: 1 } })
    ]);
}

async function assertSectionAccess(sectionId, branchId, { userId = null, role = null } = {}) {
    const id = normalizeSectionId(sectionId);
    if (!id) throw branchError('Section id is invalid.', 400, 'INVALID_SECTION_ID');
    const branch = await assertBranchAccess(branchId, { userId, role, requireActive: false });
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, branch.tenantId)
        .input('branchId', sql.Int, branch.id)
        .input('sectionId', sql.Int, id)
        .query(`SELECT TOP (1) id,tenant_id,branch_id,section_code,name,section_type,is_active,created_at,updated_at
                FROM dbo.gym_branch_sections
                WHERE tenant_id=@tenantId AND branch_id=@branchId AND id=@sectionId AND is_active=1;`));
    const row = result.recordset[0];
    if (!row) throw branchError('Section was not found in the selected branch.', 404, 'SECTION_NOT_FOUND');
    return sectionDto(row);
}

async function bootstrap({ userId = null, role = null, readOnly = false } = {}) {
    const allowedBranchesPromise = getAllowedBranches({ userId, role });
    const allBranchesPromise = String(role || '').toLowerCase() === 'owner'
        ? allowedBranchesPromise.then((branches) => branches.filter((branch) => branch.status === BRANCH_STATUS.ACTIVE))
        : listBranches({ includeArchived: false, includeInactive: false });
    const [branches, all] = await Promise.all([allowedBranchesPromise, allBranchesPromise]);
    const main = all.find((branch) => branch.isMain) || all[0] || null;
    const sectionsByBranch = await Promise.all(
        branches.map((branch) => getSectionsForAuthorizedBranch(branch))
    );
    const sections = sectionsByBranch.flat();
    const entitlements = await saasService.getEffectiveEntitlements(tenantId(), null, { readOnly });
    return {
        branches,
        activeBranches: all,
        defaultBranch: main,
        hasMultipleActiveBranches: all.length > 1,
        canUseAllBranches: String(role || '').toLowerCase() === 'owner',
        branchLimit: entitlements.limits?.maxBranches ?? null,
        sections
    };
}

async function createBranch(body = {}, { actorUserId = null, role = null, request = null } = {}) {
    await assertGymTenant();
    if (String(role || '').toLowerCase() !== 'owner') throw branchError('Only the Gym Owner can manage branches.', 403, 'OWNER_REQUIRED');
    const currentTenant = tenantId();
    const entitlements = await saasService.getEffectiveEntitlements(currentTenant);
    if (entitlements.capabilities?.branches !== true) throw branchError('Branch management is not available for this Gym subscription.', 403, 'BRANCH_CAPABILITY_DISABLED');
    const branchLimit = entitlements.limits?.maxBranches;
    if (branchLimit != null) {
        const current = await getPool().then((pool) => pool.request().input('tenantId', sql.Int, currentTenant).query("SELECT COUNT_BIG(*) AS total FROM dbo.gym_branches WHERE tenant_id=@tenantId AND status<>'archived';"));
        if (Number(current.recordset[0]?.total || 0) >= Number(branchLimit)) {
            throw branchError('The active branch limit for the current plan has been reached.', 409, 'BRANCH_LIMIT_REACHED');
        }
    }
    const code = textValue(body.code ?? body.branchCode, 'Branch code', 40, true)
        .toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
    if (!code) throw branchError('Branch code is invalid.', 400, 'BRANCH_CODE_INVALID');
    const name = textValue(body.name, 'Branch name', 160, true);
    const address = textValue(body.address, 'Address', 300);
    const phone = textValue(body.phone, 'Phone', 40);
    const workingHours = body.workingHours == null ? null : JSON.stringify(body.workingHours).slice(0, 4000);
    const storeEnabled = booleanValue(body.storeEnabled, true);
    const barEnabled = booleanValue(body.barEnabled, false);
    let created;
    await withTransaction(async (transaction) => {
        const duplicate = await transaction.request().input('tenantId', sql.Int, currentTenant).input('code', sql.VarChar(40), code)
            .query('SELECT TOP (1) id FROM dbo.gym_branches WHERE tenant_id=@tenantId AND branch_code=@code;');
        if (duplicate.recordset[0]) throw branchError('A branch with this code already exists.', 409, 'BRANCH_CODE_EXISTS');
        const result = await transaction.request()
            .input('tenantId', sql.Int, currentTenant).input('code', sql.VarChar(40), code).input('name', sql.NVarChar(160), name)
            .input('address', sql.NVarChar(300), address).input('phone', sql.NVarChar(40), phone).input('hours', sql.NVarChar(sql.MAX), workingHours)
            .input('actor', sql.Int, actorUserId == null ? null : Number(actorUserId))
            .query(`INSERT INTO dbo.gym_branches(tenant_id,branch_code,name,address,phone,working_hours_json,created_by_user_id)
                    OUTPUT INSERTED.id,INSERTED.tenant_id,INSERTED.branch_code,INSERTED.name,INSERTED.address,INSERTED.phone,INSERTED.working_hours_json,INSERTED.status,INSERTED.is_main_branch,INSERTED.created_at,INSERTED.updated_at
                    VALUES (@tenantId,@code,@name,@address,@phone,@hours,@actor);`);
        const row = result.recordset[0];
        await ensureBranchCommerceDefaults(transaction, { tenantId: currentTenant, branchId: Number(row.id), storeEnabled, barEnabled, actorUserId });
        // Migration 029 creates the section model. Keep branch creation
        // forward-compatible with pre-migration environments, while ensuring
        // every new branch receives the same safe Mixed default as existing
        // branches once the model is available.
        await transaction.request()
            .input('tenantId', sql.Int, currentTenant)
            .input('branchId', sql.Int, Number(row.id))
            .query(`
                IF OBJECT_ID(N'dbo.gym_branch_sections', N'U') IS NOT NULL
                   AND NOT EXISTS (
                       SELECT 1 FROM dbo.gym_branch_sections
                       WHERE tenant_id=@tenantId AND branch_id=@branchId AND section_type='mixed'
                   )
                BEGIN
                    INSERT INTO dbo.gym_branch_sections(tenant_id,branch_id,section_code,name,section_type)
                    VALUES (@tenantId,@branchId,'mixed',N'Mixed','mixed');
                END;
            `);
        created = branchDto({ ...row, store_enabled: storeEnabled, bar_enabled: barEnabled });
        await saasService.recordAudit({ tenantId: currentTenant, actorUserId, action: 'branch_created', entityType: 'branch', entityId: created.id, details: 'Gym branch created.', after: { code, name }, ipAddress: request?.ip, userAgent: request?.get?.('user-agent'), executor: transaction });
    });
    await invalidateBranchSectionCache(created.id, currentTenant);
    return getBranch(created.id);
}

async function updateBranch(branchId, body = {}, { actorUserId = null, role = null, request = null } = {}) {
    const current = await assertBranchAccess(branchId, { userId: actorUserId, role, requireActive: false });
    if (String(role || '').toLowerCase() !== 'owner') throw branchError('Only the Gym Owner can manage branches.', 403, 'OWNER_REQUIRED');
    const name = textValue(body.name ?? current.name, 'Branch name', 160, true);
    const address = body.address === undefined ? current.address : textValue(body.address, 'Address', 300);
    const phone = body.phone === undefined ? current.phone : textValue(body.phone, 'Phone', 40);
    const workingHours = body.workingHours === undefined
        ? current.workingHours == null ? null : JSON.stringify(current.workingHours).slice(0, 4000)
        : body.workingHours == null ? null : JSON.stringify(body.workingHours).slice(0, 4000);
    const nextStoreEnabled = booleanValue(body.storeEnabled, current.storeEnabled);
    const nextBarEnabled = booleanValue(body.barEnabled, current.barEnabled);
    const currentTenant = tenantId();
    let updated;
    await withTransaction(async (transaction) => {
        const result = await transaction.request()
            .input('tenantId', sql.Int, currentTenant).input('branchId', sql.Int, current.id).input('name', sql.NVarChar(160), name)
            .input('address', sql.NVarChar(300), address).input('phone', sql.NVarChar(40), phone).input('hours', sql.NVarChar(sql.MAX), workingHours)
            .query(`UPDATE dbo.gym_branches SET name=@name,address=@address,phone=@phone,working_hours_json=@hours,updated_at=SYSUTCDATETIME()
                    OUTPUT INSERTED.* WHERE tenant_id=@tenantId AND id=@branchId;`);
        await ensureBranchCommerceDefaults(transaction, { tenantId: currentTenant, branchId: current.id, storeEnabled: nextStoreEnabled, barEnabled: nextBarEnabled, actorUserId });
        updated = branchDto({ ...result.recordset[0], store_enabled: nextStoreEnabled, bar_enabled: nextBarEnabled });
        await saasService.recordAudit({ tenantId: currentTenant, actorUserId, action: 'branch_updated', entityType: 'branch', entityId: updated.id, details: 'Branch identity and Commerce settings updated.', before: current, after: { name, address, phone, storeEnabled: nextStoreEnabled, barEnabled: nextBarEnabled }, ipAddress: request?.ip, userAgent: request?.get?.('user-agent'), executor: transaction });
    });
    await invalidateBranchSectionCache(updated.id, currentTenant);
    return getBranch(updated.id);
}

async function archiveBranch(branchId, { actorUserId = null, role = null, request = null } = {}) {
    const current = await assertBranchAccess(branchId, { userId: actorUserId, role, requireActive: false });
    if (String(role || '').toLowerCase() !== 'owner') throw branchError('Only the Gym Owner can manage branches.', 403, 'OWNER_REQUIRED');
    const all = await listBranches({ includeArchived: false, includeInactive: false });
    if (all.length <= 1) throw branchError('The last active branch cannot be archived.', 409, 'LAST_ACTIVE_BRANCH');
    if (current.isMain) throw branchError('The main branch must be reassigned before archiving.', 409, 'MAIN_BRANCH_REASSIGN_REQUIRED');
    const result = await getPool().then((pool) => pool.request().input('tenantId', sql.Int, tenantId()).input('branchId', sql.Int, current.id)
        .query(`UPDATE dbo.gym_branches SET status='archived',updated_at=SYSUTCDATETIME() OUTPUT INSERTED.* WHERE tenant_id=@tenantId AND id=@branchId;`));
    const archived = branchDto(result.recordset[0]);
    await saasService.recordAudit({ tenantId: tenantId(), actorUserId, action: 'branch_archived', entityType: 'branch', entityId: archived.id, details: 'Gym branch archived.', before: { status: current.status }, after: { status: archived.status }, ipAddress: request?.ip, userAgent: request?.get?.('user-agent') });
    await invalidateBranchSectionCache(archived.id, tenantId());
    return archived;
}

async function assignUserBranches(userId, branchIds = [], { actorUserId = null, role = null, request = null } = {}) {
    if (String(role || '').toLowerCase() !== 'owner') throw branchError('Only the Gym Owner can manage branch access.', 403, 'OWNER_REQUIRED');
    const targetUserId = Number(userId);
    const ids = [...new Set((Array.isArray(branchIds) ? branchIds : []).map(normalizeBranchId).filter(Boolean))];
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) throw branchError('User id is invalid.', 400, 'INVALID_USER_ID');
    const id = tenantId();
    await withTransaction(async (transaction) => {
        const member = await transaction.request().input('tenantId', sql.Int, id).input('userId', sql.Int, targetUserId)
            .query(`SELECT TOP (1) ut.role,u.role AS account_role FROM dbo.gym_user_tenants ut INNER JOIN dbo.gym_users u ON u.id=ut.user_id
                    WHERE ut.tenant_id=@tenantId AND ut.user_id=@userId AND ut.status='active' AND u.role<>'PlatformAdmin';`);
        if (!member.recordset[0]) throw branchError('The user is not an active member of this Gym.', 404, 'TENANT_USER_NOT_FOUND');
        if (member.recordset[0].account_role === 'Owner') throw branchError('Owner access is implicit and cannot be restricted here.', 409, 'OWNER_BRANCH_SCOPE_IMPLICIT');
        if (ids.length) {
            const requestForIds = transaction.request().input('tenantId', sql.Int, id);
            const placeholders = ids.map((branchId, index) => { requestForIds.input(`branch${index}`, sql.Int, branchId); return `@branch${index}`; }).join(',');
            const valid = await requestForIds.query(`SELECT id FROM dbo.gym_branches WHERE tenant_id=@tenantId AND status<>'archived' AND id IN (${placeholders});`);
            if (valid.recordset.length !== ids.length) throw branchError('One or more branches are invalid for this Gym.', 400, 'BRANCH_SCOPE_INVALID');
        }
        await transaction.request().input('tenantId', sql.Int, id).input('userId', sql.Int, targetUserId).query('DELETE FROM dbo.gym_branch_user_access WHERE tenant_id=@tenantId AND user_id=@userId;');
        for (const branchId of ids) {
            await transaction.request().input('tenantId', sql.Int, id).input('branchId', sql.Int, branchId).input('userId', sql.Int, targetUserId).input('actor', sql.Int, actorUserId == null ? null : Number(actorUserId))
                .query('INSERT INTO dbo.gym_branch_user_access(tenant_id,branch_id,user_id,created_by_user_id) VALUES (@tenantId,@branchId,@userId,@actor);');
        }
        await saasService.recordAudit({ tenantId: id, actorUserId, action: 'branch_access_updated', entityType: 'user', entityId: targetUserId, details: 'User branch scope updated.', after: { branchIds: ids }, ipAddress: request?.ip, userAgent: request?.get?.('user-agent'), executor: transaction });
    });
    return getAllowedBranches({ userId: targetUserId, role: 'Assistant' });
}

async function getUserBranchAccess(userId, { actorUserId = null, role = null } = {}) {
    const targetUserId = Number(userId);
    if (String(role || '').toLowerCase() !== 'owner' && Number(actorUserId) !== targetUserId) {
        throw branchError('You may only view your own branch access.', 403, 'BRANCH_ACCESS_SCOPE_DENIED');
    }
    const id = tenantId();
    const result = await getPool().then((pool) => pool.request().input('tenantId', sql.Int, id).input('userId', sql.Int, targetUserId)
        .query(`SELECT b.*,c.store_enabled,c.bar_enabled FROM dbo.gym_branch_user_access a
                INNER JOIN dbo.gym_branches b ON b.id=a.branch_id AND b.tenant_id=a.tenant_id
                LEFT JOIN dbo.gym_branch_commerce_config c ON c.branch_id=b.id AND c.tenant_id=b.tenant_id
                WHERE a.tenant_id=@tenantId AND a.user_id=@userId ORDER BY b.name,b.id;`));
    return result.recordset.map(branchDto);
}

async function getMembershipBranchAccess(membershipId, { includeArchived = false } = {}) {
    const id = idValue(membershipId, 'Membership id');
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, tenantId())
        .input('membershipId', sql.Int, id)
        .input('includeArchived', sql.Bit, includeArchived ? 1 : 0)
        .query(`SELECT b.*,c.store_enabled,c.bar_enabled,m.branch_access_mode
                FROM dbo.gym_membership_branch_access AS access
                INNER JOIN dbo.memberships AS m ON m.id=access.membership_id AND m.tenant_id=access.tenant_id
                INNER JOIN dbo.gym_branches AS b ON b.id=access.branch_id AND b.tenant_id=access.tenant_id
                LEFT JOIN dbo.gym_branch_commerce_config AS c ON c.branch_id=b.id AND c.tenant_id=b.tenant_id
                WHERE access.tenant_id=@tenantId AND access.membership_id=@membershipId
                  AND (@includeArchived=1 OR b.status<>'archived')
                ORDER BY b.is_main_branch DESC,b.name,b.id;`));
    return {
        membershipId: id,
        mode: normalizeMembershipBranchAccessMode(result.recordset[0]?.branch_access_mode),
        branches: result.recordset.map(branchDto)
    };
}

async function assertMembershipBranchAccess(membershipId, branchId) {
    const requestedBranchId = idValue(branchId);
    const access = await getMembershipBranchAccess(membershipId);
    if (access.mode === MEMBERSHIP_BRANCH_ACCESS_MODE.ALL_BRANCHES) {
        await assertBranchAccess(requestedBranchId, { role: 'Owner' });
        return true;
    }
    if (!access.branches.some((branch) => branch.id === requestedBranchId)) {
        throw branchError('This membership is not eligible for the selected branch.', 403, 'MEMBERSHIP_BRANCH_ACCESS_DENIED');
    }
    return true;
}

async function setMembershipBranchAccess(membershipId, { mode = MEMBERSHIP_BRANCH_ACCESS_MODE.SINGLE_BRANCH, branchIds = [], actorUserId = null, request = null } = {}) {
    const id = idValue(membershipId, 'Membership id');
    const normalizedMode = normalizeMembershipBranchAccessMode(mode);
    const requestedIds = [...new Set((Array.isArray(branchIds) ? branchIds : []).map((value) => normalizeBranchId(value)).filter(Boolean))];
    if (normalizedMode === MEMBERSHIP_BRANCH_ACCESS_MODE.SINGLE_BRANCH && requestedIds.length !== 1) {
        throw branchError('A single-branch membership requires exactly one active branch.', 400, 'MEMBERSHIP_BRANCH_SELECTION_REQUIRED');
    }
    if (normalizedMode === MEMBERSHIP_BRANCH_ACCESS_MODE.SELECTED_BRANCHES && requestedIds.length < 1) {
        throw branchError('Select at least one active branch for this membership.', 400, 'MEMBERSHIP_BRANCH_SELECTION_REQUIRED');
    }
    const tenant = await assertGymTenant();
    let resolvedIds = requestedIds;
    if (normalizedMode === MEMBERSHIP_BRANCH_ACCESS_MODE.ALL_BRANCHES) resolvedIds = [];
    await withTransaction(async (transaction) => {
        const membership = await transaction.request().input('tenantId', sql.Int, tenant.tenantId).input('membershipId', sql.Int, id)
            .query('SELECT TOP (1) id FROM dbo.memberships WHERE id=@membershipId AND tenant_id=@tenantId;');
        if (!membership.recordset[0]) throw branchError('Membership was not found.', 404, 'MEMBERSHIP_NOT_FOUND');
        if (resolvedIds.length) {
            const check = transaction.request().input('tenantId', sql.Int, tenant.tenantId);
            const placeholders = resolvedIds.map((branch, index) => { check.input(`branch${index}`, sql.Int, branch); return `@branch${index}`; });
            const valid = await check.query(`SELECT id FROM dbo.gym_branches WHERE tenant_id=@tenantId AND status='active' AND id IN (${placeholders.join(',')});`);
            if (valid.recordset.length !== resolvedIds.length) throw branchError('One or more selected branches are invalid.', 400, 'BRANCH_SCOPE_INVALID');
        }
        await transaction.request().input('tenantId', sql.Int, tenant.tenantId).input('membershipId', sql.Int, id)
            .query('DELETE FROM dbo.gym_membership_branch_access WHERE tenant_id=@tenantId AND membership_id=@membershipId;');
        for (const branchId of resolvedIds) {
            await transaction.request().input('tenantId', sql.Int, tenant.tenantId).input('membershipId', sql.Int, id).input('branchId', sql.Int, branchId)
                .query('INSERT INTO dbo.gym_membership_branch_access(tenant_id,membership_id,branch_id) VALUES (@tenantId,@membershipId,@branchId);');
        }
        await transaction.request().input('tenantId', sql.Int, tenant.tenantId).input('membershipId', sql.Int, id).input('mode', sql.VarChar(24), normalizedMode)
            .query('UPDATE dbo.memberships SET branch_access_mode=@mode WHERE tenant_id=@tenantId AND id=@membershipId;');
        await saasService.recordAudit({ tenantId: tenant.tenantId, actorUserId, action: 'membership_branch_access_updated', entityType: 'membership', entityId: id, details: 'Membership branch eligibility updated.', after: { mode: normalizedMode, branchIds: resolvedIds }, ipAddress: request?.ip, userAgent: request?.get?.('user-agent'), executor: transaction });
    });
    return getMembershipBranchAccess(id);
}

module.exports = {
    archiveBranch,
    assertBranchAccess,
    assertGymTenant,
    assignUserBranches,
    bootstrap,
    createBranch,
    getAllowedBranches,
    getBranchSections,
    assertSectionAccess,
    getBranch,
    getUserBranchAccess,
    getMembershipBranchAccess,
    assertMembershipBranchAccess,
    setMembershipBranchAccess,
    listBranches,
    updateBranch,
    BRANCH_STATUS
};
