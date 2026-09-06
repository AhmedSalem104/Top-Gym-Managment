'use strict';

const crypto = require('node:crypto');
const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');
const { currentTenantId, getTenantContext } = require('../tenancy/tenant-context');
const { parseDateOnly, todayInTimeZone, toUtcDate, formatDateOnly } = require('../utils/date');
const trainerService = require('./trainer-service');
const coachingService = require('./coaching-service');
const saasService = require('./saas-service');

const GOAL_TYPES = new Set(['weight_loss', 'muscle_gain', 'strength', 'fitness', 'performance', 'custom']);
const GOAL_STATUSES = new Set(['active', 'completed', 'paused', 'archived']);
const TEMPLATE_TYPES = new Set(['training', 'nutrition', 'assessment', 'checkin', 'package']);
const TASK_TYPES = new Set(['follow_up', 'measurement', 'program', 'payment', 'renewal', 'session', 'custom']);
const TASK_STATUSES = new Set(['open', 'in_progress', 'completed', 'dismissed']);

function studioError(message, statusCode = 400, code = 'TRAINER_STUDIO_ERROR') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    return error;
}

function positiveId(value, label = 'المعرّف') {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw studioError(`${label} غير صالح.`, 422, 'INVALID_IDENTIFIER');
    return id;
}

function boundedText(value, label, max, { required = false } = {}) {
    const normalized = String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
    if (required && !normalized) throw studioError(`${label} مطلوب.`, 422, 'VALIDATION_ERROR');
    if (normalized.length > max) throw studioError(`${label} أطول من المسموح.`, 422, 'VALIDATION_ERROR');
    return normalized || null;
}

function decimalOrNull(value, label, { min = -999999999, max = 999999999 } = {}) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) throw studioError(`${label} غير صالح.`, 422, 'VALIDATION_ERROR');
    return Math.round(number * 1000) / 1000;
}

function goalType(value, fallback = 'custom') {
    const normalized = String(value || fallback).trim().toLowerCase();
    if (!GOAL_TYPES.has(normalized)) throw studioError('نوع الهدف غير صالح.', 422, 'VALIDATION_ERROR');
    return normalized;
}

function goalStatus(value, fallback = 'active') {
    const normalized = String(value || fallback).trim().toLowerCase();
    if (!GOAL_STATUSES.has(normalized)) throw studioError('حالة الهدف غير صالحة.', 422, 'VALIDATION_ERROR');
    return normalized;
}

function templateType(value, fallback = 'training') {
    const normalized = String(value || fallback).trim().toLowerCase();
    if (!TEMPLATE_TYPES.has(normalized)) throw studioError('نوع القالب غير صالح.', 422, 'VALIDATION_ERROR');
    return normalized;
}

function taskType(value, fallback = 'custom') {
    const normalized = String(value || fallback).trim().toLowerCase();
    if (!TASK_TYPES.has(normalized)) throw studioError('نوع المهمة غير صالح.', 422, 'VALIDATION_ERROR');
    return normalized;
}

function taskStatus(value, fallback = 'open') {
    const normalized = String(value || fallback).trim().toLowerCase();
    if (!TASK_STATUSES.has(normalized)) throw studioError('حالة المهمة غير صالحة.', 422, 'VALIDATION_ERROR');
    return normalized;
}

function idempotencyHash(value) {
    const normalized = String(value ?? '').trim();
    if (!normalized || normalized.length > 200) throw studioError('مفتاح العملية مطلوب.', 422, 'IDEMPOTENCY_KEY_REQUIRED');
    return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function actorUserId() {
    const value = Number(getTenantContext()?.userId);
    return Number.isInteger(value) && value > 0 ? value : null;
}

async function assertTrainerContext() {
    const tenant = await trainerService.assertTrainerTenant();
    return { tenantId: tenant.id, tenant };
}

async function assertClient(executor, memberIdValue) {
    const memberId = positiveId(memberIdValue, 'معرّف العميل');
    const tenantId = currentTenantId({ required: true });
    const result = await executor.request()
        .input('tenantId', sql.Int, tenantId)
        .input('memberId', sql.Int, memberId)
        .query('SELECT TOP (1) id,full_name FROM dbo.members WHERE id=@memberId AND tenant_id=@tenantId AND ISNULL(profile_status,\'active\') <> \'archived\';');
    if (!result.recordset[0]) throw studioError('العميل غير موجود في مساحة المدرب.', 404, 'CLIENT_NOT_FOUND');
    return result.recordset[0];
}

function mapGoal(row) {
    return {
        id: Number(row.id),
        memberId: Number(row.member_id),
        clientName: row.client_name,
        goalType: row.goal_type,
        title: row.title,
        unit: row.unit || null,
        startValue: row.start_value == null ? null : Number(row.start_value),
        targetValue: row.target_value == null ? null : Number(row.target_value),
        currentValue: row.current_value == null ? null : Number(row.current_value),
        startsOn: formatDateOnly(row.starts_on),
        deadline: formatDateOnly(row.deadline),
        status: row.status,
        notes: row.notes || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function listGoals({ memberId = null, status = null, includeArchived = false, readOnly = false } = {}) {
    await assertTrainerContext();
    const tenantId = currentTenantId({ required: true });
    const normalizedStatus = status ? goalStatus(status) : null;
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, tenantId)
        .input('memberId', sql.Int, memberId == null ? null : positiveId(memberId, 'معرّف العميل'))
        .input('status', sql.VarChar(20), normalizedStatus)
        .input('includeArchived', sql.Bit, includeArchived ? 1 : 0)
        .query(`SELECT g.*,m.full_name AS client_name
                FROM dbo.gym_trainer_goals g
                INNER JOIN dbo.members m ON m.id=g.member_id AND m.tenant_id=g.tenant_id
                WHERE g.tenant_id=@tenantId
                  AND (@memberId IS NULL OR g.member_id=@memberId)
                  AND (@status IS NULL OR g.status=@status)
                  AND (@includeArchived=1 OR g.status <> 'archived')
                ORDER BY CASE WHEN g.status='active' THEN 0 WHEN g.status='paused' THEN 1 ELSE 2 END,
                         g.deadline ASC,g.updated_at DESC,g.id DESC;`));
    return result.recordset.map(mapGoal);
}

async function createGoal(body = {}) {
    const { tenantId } = await assertTrainerContext();
    const memberId = positiveId(body.memberId ?? body.clientId, 'معرّف العميل');
    const data = {
        memberId,
        goalType: goalType(body.goalType),
        title: boundedText(body.title, 'عنوان الهدف', 160, { required: true }),
        unit: boundedText(body.unit, 'وحدة القياس', 24),
        startValue: decimalOrNull(body.startValue, 'قيمة البداية'),
        targetValue: decimalOrNull(body.targetValue, 'القيمة المستهدفة'),
        currentValue: decimalOrNull(body.currentValue, 'القيمة الحالية'),
        startsOn: parseDateOnly(body.startsOn || todayInTimeZone(), 'تاريخ بداية الهدف'),
        deadline: body.deadline ? parseDateOnly(body.deadline, 'موعد الهدف') : null,
        status: goalStatus(body.status),
        notes: boundedText(body.notes, 'ملاحظات الهدف', 1000)
    };
    if (data.deadline && data.deadline < data.startsOn) throw studioError('موعد الهدف يجب أن يأتي بعد تاريخ البداية.', 422, 'GOAL_DATE_RANGE_INVALID');
    const keyHash = body.idempotencyKey ? idempotencyHash(body.idempotencyKey) : null;
    const id = await withTransaction(async (transaction) => {
        await assertClient(transaction, memberId);
        if (keyHash) {
            const replay = await transaction.request().input('tenantId', sql.Int, tenantId).input('hash', sql.Char(64), keyHash)
                .query('SELECT TOP (1) id,member_id,goal_type,title FROM dbo.gym_trainer_goals WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND idempotency_key_hash=@hash;')
                .catch((error) => { if (error.number === 207) return { recordset: [] }; throw error; });
            if (replay.recordset[0]) {
                const row = replay.recordset[0];
                if (Number(row.member_id) !== memberId || row.goal_type !== data.goalType || row.title !== data.title) throw studioError('مفتاح العملية مستخدم لهدف مختلف.', 409, 'GOAL_IDEMPOTENCY_CONFLICT');
                return Number(row.id);
            }
        }
        const result = await transaction.request()
            .input('tenantId', sql.Int, tenantId).input('memberId', sql.Int, memberId)
            .input('goalType', sql.VarChar(32), data.goalType).input('title', sql.NVarChar(160), data.title)
            .input('unit', sql.VarChar(24), data.unit).input('startValue', sql.Decimal(12, 3), data.startValue)
            .input('targetValue', sql.Decimal(12, 3), data.targetValue).input('currentValue', sql.Decimal(12, 3), data.currentValue)
            .input('startsOn', sql.Date, toUtcDate(data.startsOn)).input('deadline', sql.Date, data.deadline ? toUtcDate(data.deadline) : null)
            .input('status', sql.VarChar(20), data.status).input('notes', sql.NVarChar(1000), data.notes)
            .input('hash', sql.Char(64), keyHash)
            .query(`INSERT INTO dbo.gym_trainer_goals
                    (tenant_id,member_id,goal_type,title,unit,start_value,target_value,current_value,starts_on,deadline,status,notes,idempotency_key_hash)
                    OUTPUT INSERTED.id
                    VALUES (@tenantId,@memberId,@goalType,@title,@unit,@startValue,@targetValue,@currentValue,@startsOn,@deadline,@status,@notes,@hash);`);
        const goalId = Number(result.recordset[0].id);
        await saasService.recordAudit({ tenantId, actorUserId: actorUserId(), action: 'trainer_goal_created', entityType: 'trainer_goal', entityId: goalId, details: 'Trainer goal created.', after: data, executor: transaction });
        return goalId;
    });
    return (await listGoals({ memberId, readOnly: true })).find((item) => item.id === id) || null;
}

async function updateGoal(goalIdValue, body = {}) {
    const { tenantId } = await assertTrainerContext();
    const goalId = positiveId(goalIdValue, 'معرّف الهدف');
    const result = await withTransaction(async (transaction) => {
        const currentResult = await transaction.request().input('tenantId', sql.Int, tenantId).input('id', sql.BigInt, goalId)
            .query('SELECT TOP (1) * FROM dbo.gym_trainer_goals WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND id=@id;');
        const current = currentResult.recordset[0];
        if (!current) throw studioError('الهدف غير موجود.', 404, 'GOAL_NOT_FOUND');
        const data = {
            memberId: Number(current.member_id),
            goalType: body.goalType === undefined ? current.goal_type : goalType(body.goalType),
            title: body.title === undefined ? current.title : boundedText(body.title, 'عنوان الهدف', 160, { required: true }),
            unit: body.unit === undefined ? current.unit : boundedText(body.unit, 'وحدة القياس', 24),
            startValue: body.startValue === undefined ? (current.start_value == null ? null : Number(current.start_value)) : decimalOrNull(body.startValue, 'قيمة البداية'),
            targetValue: body.targetValue === undefined ? (current.target_value == null ? null : Number(current.target_value)) : decimalOrNull(body.targetValue, 'القيمة المستهدفة'),
            currentValue: body.currentValue === undefined ? (current.current_value == null ? null : Number(current.current_value)) : decimalOrNull(body.currentValue, 'القيمة الحالية'),
            startsOn: body.startsOn === undefined ? formatDateOnly(current.starts_on) : parseDateOnly(body.startsOn, 'تاريخ بداية الهدف'),
            deadline: body.deadline === undefined ? formatDateOnly(current.deadline) : (body.deadline ? parseDateOnly(body.deadline, 'موعد الهدف') : null),
            status: body.status === undefined ? current.status : goalStatus(body.status),
            notes: body.notes === undefined ? current.notes : boundedText(body.notes, 'ملاحظات الهدف', 1000)
        };
        if (data.deadline && data.deadline < data.startsOn) throw studioError('موعد الهدف يجب أن يأتي بعد تاريخ البداية.', 422, 'GOAL_DATE_RANGE_INVALID');
        await transaction.request().input('id', sql.BigInt, goalId).input('goalType', sql.VarChar(32), data.goalType).input('title', sql.NVarChar(160), data.title)
            .input('unit', sql.VarChar(24), data.unit).input('startValue', sql.Decimal(12, 3), data.startValue).input('targetValue', sql.Decimal(12, 3), data.targetValue)
            .input('currentValue', sql.Decimal(12, 3), data.currentValue).input('startsOn', sql.Date, toUtcDate(data.startsOn)).input('deadline', sql.Date, data.deadline ? toUtcDate(data.deadline) : null)
            .input('status', sql.VarChar(20), data.status).input('notes', sql.NVarChar(1000), data.notes).input('tenantId', sql.Int, tenantId)
            .query(`UPDATE dbo.gym_trainer_goals SET goal_type=@goalType,title=@title,unit=@unit,start_value=@startValue,target_value=@targetValue,current_value=@currentValue,
                    starts_on=@startsOn,deadline=@deadline,status=@status,notes=@notes,updated_at=SYSUTCDATETIME()
                    WHERE tenant_id=@tenantId AND id=@id;`);
        await saasService.recordAudit({ tenantId, actorUserId: actorUserId(), action: 'trainer_goal_updated', entityType: 'trainer_goal', entityId: goalId, details: 'Trainer goal updated.', before: { status: current.status }, after: data, executor: transaction });
        return data.memberId;
    });
    return (await listGoals({ memberId: result, readOnly: true })).find((item) => item.id === goalId) || null;
}

async function setGoalStatus(goalIdValue, statusValue) {
    return updateGoal(goalIdValue, { status: statusValue });
}

async function deleteGoal(goalIdValue) {
    const { tenantId } = await assertTrainerContext();
    const goalId = positiveId(goalIdValue, 'معرّف الهدف');
    await withTransaction(async (transaction) => {
        const result = await transaction.request().input('tenantId', sql.Int, tenantId).input('id', sql.BigInt, goalId)
            .query('SELECT TOP (1) member_id,status FROM dbo.gym_trainer_goals WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND id=@id;');
        if (!result.recordset[0]) throw studioError('الهدف غير موجود.', 404, 'GOAL_NOT_FOUND');
        await transaction.request().input('tenantId', sql.Int, tenantId).input('id', sql.BigInt, goalId).query('UPDATE dbo.gym_trainer_goals SET status=\'archived\',updated_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@id;');
        await saasService.recordAudit({ tenantId, actorUserId: actorUserId(), action: 'trainer_goal_archived', entityType: 'trainer_goal', entityId: goalId, details: 'Trainer goal archived.', executor: transaction });
    });
}

function mapTemplate(row) {
    let payload = {};
    try { payload = JSON.parse(row.payload_json); } catch (_) { payload = {}; }
    return { id: Number(row.id), templateType: row.template_type, name: row.name, description: row.description || null, payload, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}

function templatePayload(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw studioError('بيانات القالب يجب أن تكون كائنًا.', 422, 'TEMPLATE_PAYLOAD_INVALID');
    const serialized = JSON.stringify(value);
    if (serialized.length > 100000) throw studioError('بيانات القالب أكبر من المسموح.', 422, 'TEMPLATE_PAYLOAD_TOO_LARGE');
    return { value, serialized };
}

async function listTemplates({ type = null, includeArchived = false } = {}) {
    await assertTrainerContext();
    const tenantId = currentTenantId({ required: true });
    const normalizedType = type ? templateType(type) : null;
    const result = await getPool().then((pool) => pool.request().input('tenantId', sql.Int, tenantId).input('type', sql.VarChar(24), normalizedType).input('includeArchived', sql.Bit, includeArchived ? 1 : 0)
        .query(`SELECT * FROM dbo.gym_trainer_templates WHERE tenant_id=@tenantId AND (@type IS NULL OR template_type=@type)
                AND (@includeArchived=1 OR status='active') ORDER BY updated_at DESC,id DESC;`));
    return result.recordset.map(mapTemplate);
}

async function createTemplate(body = {}) {
    const { tenantId } = await assertTrainerContext();
    const type = templateType(body.templateType || body.type);
    const name = boundedText(body.name, 'اسم القالب', 160, { required: true });
    const description = boundedText(body.description, 'وصف القالب', 1000);
    const payload = templatePayload(body.payload || {});
    const keyHash = body.idempotencyKey ? idempotencyHash(body.idempotencyKey) : null;
    const id = await withTransaction(async (transaction) => {
        if (keyHash) {
            const replay = await transaction.request().input('tenantId', sql.Int, tenantId).input('hash', sql.Char(64), keyHash).query('SELECT TOP (1) id FROM dbo.gym_trainer_templates WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND idempotency_key_hash=@hash;');
            if (replay.recordset[0]) return Number(replay.recordset[0].id);
        }
        const result = await transaction.request().input('tenantId', sql.Int, tenantId).input('type', sql.VarChar(24), type).input('name', sql.NVarChar(160), name).input('description', sql.NVarChar(1000), description).input('payload', sql.NVarChar(sql.MAX), payload.serialized).input('hash', sql.Char(64), keyHash)
            .query('INSERT INTO dbo.gym_trainer_templates(tenant_id,template_type,name,description,payload_json,idempotency_key_hash) OUTPUT INSERTED.id VALUES (@tenantId,@type,@name,@description,@payload,@hash);');
        const templateId = Number(result.recordset[0].id);
        await saasService.recordAudit({ tenantId, actorUserId: actorUserId(), action: 'trainer_template_created', entityType: 'trainer_template', entityId: templateId, details: 'Trainer template created.', after: { type, name }, executor: transaction });
        return templateId;
    });
    return (await listTemplates({ type })).find((item) => item.id === id) || null;
}

async function updateTemplate(templateIdValue, body = {}) {
    const { tenantId } = await assertTrainerContext();
    const templateId = positiveId(templateIdValue, 'معرّف القالب');
    await withTransaction(async (transaction) => {
        const result = await transaction.request().input('tenantId', sql.Int, tenantId).input('id', sql.BigInt, templateId).query('SELECT TOP (1) * FROM dbo.gym_trainer_templates WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND id=@id;');
        const current = result.recordset[0];
        if (!current) throw studioError('القالب غير موجود.', 404, 'TEMPLATE_NOT_FOUND');
        const type = body.templateType === undefined && body.type === undefined ? current.template_type : templateType(body.templateType || body.type);
        const name = body.name === undefined ? current.name : boundedText(body.name, 'اسم القالب', 160, { required: true });
        const description = body.description === undefined ? current.description : boundedText(body.description, 'وصف القالب', 1000);
        let payload;
        if (body.payload === undefined) {
            try { payload = { value: JSON.parse(current.payload_json), serialized: current.payload_json }; }
            catch (_) { throw studioError('بيانات القالب الحالية غير صالحة.', 500, 'TEMPLATE_PAYLOAD_CORRUPT'); }
        } else payload = templatePayload(body.payload);
        const status = body.status === undefined ? current.status : (String(body.status).toLowerCase() === 'archived' ? 'archived' : 'active');
        await transaction.request().input('tenantId', sql.Int, tenantId).input('id', sql.BigInt, templateId).input('type', sql.VarChar(24), type).input('name', sql.NVarChar(160), name).input('description', sql.NVarChar(1000), description).input('payload', sql.NVarChar(sql.MAX), payload.serialized).input('status', sql.VarChar(20), status).query('UPDATE dbo.gym_trainer_templates SET template_type=@type,name=@name,description=@description,payload_json=@payload,status=@status,updated_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@id;');
        await saasService.recordAudit({ tenantId, actorUserId: actorUserId(), action: 'trainer_template_updated', entityType: 'trainer_template', entityId: templateId, details: 'Trainer template updated.', after: { type, name, status }, executor: transaction });
    });
    return (await listTemplates({ includeArchived: true })).find((item) => item.id === templateId) || null;
}

async function instantiateTemplate(templateIdValue, body = {}) {
    const { tenantId } = await assertTrainerContext();
    const templateId = positiveId(templateIdValue, 'معرّف القالب');
    const memberId = positiveId(body.memberId ?? body.clientId, 'معرّف العميل');
    const result = await getPool().then((pool) => pool.request().input('tenantId', sql.Int, tenantId).input('id', sql.BigInt, templateId).query('SELECT TOP (1) * FROM dbo.gym_trainer_templates WHERE tenant_id=@tenantId AND id=@id AND status=\'active\';'));
    const template = result.recordset[0];
    if (!template) throw studioError('القالب غير موجود أو مؤرشف.', 404, 'TEMPLATE_NOT_FOUND');
    await getPool().then((pool) => assertClient(pool, memberId));
    let payload;
    try { payload = JSON.parse(template.payload_json); } catch (_) { throw studioError('بيانات القالب غير صالحة.', 500, 'TEMPLATE_PAYLOAD_CORRUPT'); }
    if (template.template_type === 'training') return coachingService.createWorkoutProgram({ ...payload, memberId });
    if (template.template_type === 'nutrition') return coachingService.createDietPlan({ ...payload, memberId });
    throw studioError('هذا النوع من القوالب محفوظ للمراجعة ولا يملك عملية تطبيق آمنة بعد.', 409, 'TEMPLATE_INSTANTIATION_UNSUPPORTED');
}

async function getNotifications({ limit = 50 } = {}) {
    const { tenantId } = await assertTrainerContext();
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const commerceService = require('./trainer-commerce-service');
    const [followUp, sessions, purchases] = await Promise.all([
        trainerService.getFollowUp({ limit: safeLimit, readOnly: true }),
        commerceService.listSessions({ readOnly: true }),
        commerceService.listPurchases({ readOnly: true })
    ]);
    const items = [];
    for (const client of followUp.clients || []) {
        for (const reason of client.reasons || []) items.push({ id: `followup-${client.clientId}-${reason}`, kind: 'follow_up', severity: ['payment_outstanding', 'package_expiring'].includes(reason) ? 'warning' : 'info', title: ({ assessment_due: 'قياس مستحق', checkin_due: 'متابعة مستحقة', package_expiring: 'الباقة تقترب من الانتهاء', payment_outstanding: 'رصيد مستحق' }[reason] || reason), clientId: Number(client.clientId), clientName: client.clientName, occurredAt: client.lastActivityAt || null, action: { route: 'clients', label: 'فتح ملف العميل' } });
    }
    const now = Date.now();
    for (const session of sessions) {
        const timestamp = new Date(session.scheduledStart).getTime();
        if (session.status === 'scheduled' && Number.isFinite(timestamp) && timestamp >= now && timestamp <= now + 48 * 60 * 60 * 1000) items.push({ id: `session-${session.id}`, kind: 'session', severity: 'info', title: 'جلسة قادمة خلال 48 ساعة', clientId: session.memberId, clientName: session.clientName, occurredAt: session.scheduledStart, action: { route: 'sessions', label: 'فتح الجلسات' } });
    }
    for (const purchase of purchases) {
        const expiry = purchase.endsOn ? new Date(`${purchase.endsOn}T23:59:59Z`).getTime() : null;
        if (purchase.status === 'active' && ((expiry && expiry <= now + 14 * 86400000) || Number(purchase.sessionsRemaining || 0) <= 2 || Number(purchase.amountRemaining || 0) > 0)) items.push({ id: `purchase-${purchase.id}`, kind: 'package', severity: Number(purchase.amountRemaining || 0) > 0 ? 'warning' : 'info', title: Number(purchase.amountRemaining || 0) > 0 ? 'تحصيل متبقي على باقة' : 'باقة تحتاج متابعة', clientId: purchase.memberId, clientName: purchase.clientName, occurredAt: purchase.endsOn || purchase.createdAt, action: { route: 'sales', label: 'فتح التحصيلات' } });
    }
    items.sort((a, b) => String(b.occurredAt || '').localeCompare(String(a.occurredAt || '')) || a.id.localeCompare(b.id));
    return { tenantId, notifications: items.slice(0, safeLimit), counts: { total: items.length, warning: items.filter((item) => item.severity === 'warning').length, info: items.filter((item) => item.severity === 'info').length } };
}

function mapTask(row) {
    return {
        id: Number(row.id),
        memberId: row.member_id == null ? null : Number(row.member_id),
        clientName: row.client_name || null,
        taskType: row.task_type,
        title: row.title,
        notes: row.notes || null,
        dueOn: formatDateOnly(row.due_on),
        status: row.status,
        createdByUserId: row.created_by_user_id == null ? null : Number(row.created_by_user_id),
        completedAt: row.completed_at || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function listTasks({ memberId = null, status = null, includeDismissed = false, limit = 100, readOnly = false } = {}) {
    await assertTrainerContext();
    const tenantId = currentTenantId({ required: true });
    const normalizedStatus = status ? taskStatus(status) : null;
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, tenantId)
        .input('memberId', sql.Int, memberId == null ? null : positiveId(memberId, 'معرّف العميل'))
        .input('status', sql.VarChar(20), normalizedStatus)
        .input('includeDismissed', sql.Bit, includeDismissed ? 1 : 0)
        .input('limit', sql.Int, safeLimit)
        .query(`SELECT TOP (@limit) t.*,m.full_name AS client_name
                FROM dbo.gym_trainer_tasks t
                LEFT JOIN dbo.members m ON m.id=t.member_id AND m.tenant_id=t.tenant_id
                WHERE t.tenant_id=@tenantId
                  AND (@memberId IS NULL OR t.member_id=@memberId)
                  AND (@status IS NULL OR t.status=@status)
                  AND (@includeDismissed=1 OR t.status <> 'dismissed')
                ORDER BY CASE WHEN t.status='completed' THEN 2 WHEN t.status='dismissed' THEN 3 ELSE 0 END,
                         CASE WHEN t.due_on IS NULL THEN 1 ELSE 0 END,t.due_on ASC,t.updated_at DESC,t.id DESC;`));
    return result.recordset.map(mapTask);
}

async function createTask(body = {}) {
    const { tenantId } = await assertTrainerContext();
    const memberId = body.memberId == null && body.clientId == null ? null : positiveId(body.memberId ?? body.clientId, 'معرّف العميل');
    const data = {
        memberId,
        taskType: taskType(body.taskType || body.type),
        title: boundedText(body.title, 'عنوان المهمة', 160, { required: true }),
        notes: boundedText(body.notes, 'ملاحظات المهمة', 1000),
        dueOn: body.dueOn ? parseDateOnly(body.dueOn, 'موعد المهمة') : null,
        status: taskStatus(body.status),
        completedAt: null
    };
    if (data.status === 'completed') data.completedAt = new Date();
    const keyHash = body.idempotencyKey ? idempotencyHash(body.idempotencyKey) : null;
    const taskId = await withTransaction(async (transaction) => {
        if (memberId != null) await assertClient(transaction, memberId);
        if (keyHash) {
            const replay = await transaction.request()
                .input('tenantId', sql.Int, tenantId).input('hash', sql.Char(64), keyHash)
                .query('SELECT TOP (1) id,title,member_id,task_type FROM dbo.gym_trainer_tasks WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND idempotency_key_hash=@hash;');
            if (replay.recordset[0]) {
                const row = replay.recordset[0];
                if (row.title !== data.title || Number(row.member_id || 0) !== Number(data.memberId || 0) || row.task_type !== data.taskType) {
                    throw studioError('مفتاح العملية مستخدم لمهمة مختلفة.', 409, 'TASK_IDEMPOTENCY_CONFLICT');
                }
                return Number(row.id);
            }
        }
        const result = await transaction.request()
            .input('tenantId', sql.Int, tenantId).input('memberId', sql.Int, data.memberId)
            .input('taskType', sql.VarChar(32), data.taskType).input('title', sql.NVarChar(160), data.title)
            .input('notes', sql.NVarChar(1000), data.notes).input('dueOn', sql.Date, data.dueOn ? toUtcDate(data.dueOn) : null)
            .input('status', sql.VarChar(20), data.status).input('createdByUserId', sql.Int, actorUserId())
            .input('completedAt', sql.DateTime2, data.completedAt).input('hash', sql.Char(64), keyHash)
            .query(`INSERT INTO dbo.gym_trainer_tasks
                    (tenant_id,member_id,task_type,title,notes,due_on,status,created_by_user_id,completed_at,idempotency_key_hash)
                    OUTPUT INSERTED.id
                    VALUES (@tenantId,@memberId,@taskType,@title,@notes,@dueOn,@status,@createdByUserId,@completedAt,@hash);`);
        const id = Number(result.recordset[0].id);
        await saasService.recordAudit({ tenantId, actorUserId: actorUserId(), action: 'trainer_task_created', entityType: 'trainer_task', entityId: id, details: 'Trainer task created.', after: { memberId, taskType: data.taskType, status: data.status }, executor: transaction });
        return id;
    });
    return (await listTasks({ memberId, includeDismissed: true, limit: 200, readOnly: true })).find((item) => item.id === taskId) || null;
}

async function updateTask(taskIdValue, body = {}) {
    const { tenantId } = await assertTrainerContext();
    const taskId = positiveId(taskIdValue, 'معرّف المهمة');
    const memberId = body.memberId === undefined && body.clientId === undefined
        ? undefined
        : (body.memberId == null && body.clientId == null ? null : positiveId(body.memberId ?? body.clientId, 'معرّف العميل'));
    const result = await withTransaction(async (transaction) => {
        const currentResult = await transaction.request().input('tenantId', sql.Int, tenantId).input('id', sql.BigInt, taskId)
            .query('SELECT TOP (1) * FROM dbo.gym_trainer_tasks WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND id=@id;');
        const current = currentResult.recordset[0];
        if (!current) throw studioError('المهمة غير موجودة.', 404, 'TASK_NOT_FOUND');
        const nextMemberId = memberId === undefined ? (current.member_id == null ? null : Number(current.member_id)) : memberId;
        if (nextMemberId != null) await assertClient(transaction, nextMemberId);
        const nextStatus = body.status === undefined ? current.status : taskStatus(body.status);
        const nextCompletedAt = nextStatus === 'completed' ? (current.completed_at || new Date()) : null;
        const next = {
            memberId: nextMemberId,
            taskType: body.taskType === undefined && body.type === undefined ? current.task_type : taskType(body.taskType || body.type),
            title: body.title === undefined ? current.title : boundedText(body.title, 'عنوان المهمة', 160, { required: true }),
            notes: body.notes === undefined ? current.notes : boundedText(body.notes, 'ملاحظات المهمة', 1000),
            dueOn: body.dueOn === undefined ? formatDateOnly(current.due_on) : (body.dueOn ? parseDateOnly(body.dueOn, 'موعد المهمة') : null),
            status: nextStatus,
            completedAt: nextCompletedAt
        };
        await transaction.request()
            .input('tenantId', sql.Int, tenantId).input('id', sql.BigInt, taskId).input('memberId', sql.Int, next.memberId)
            .input('taskType', sql.VarChar(32), next.taskType).input('title', sql.NVarChar(160), next.title)
            .input('notes', sql.NVarChar(1000), next.notes).input('dueOn', sql.Date, next.dueOn ? toUtcDate(next.dueOn) : null)
            .input('status', sql.VarChar(20), next.status).input('completedAt', sql.DateTime2, next.completedAt)
            .query(`UPDATE dbo.gym_trainer_tasks SET member_id=@memberId,task_type=@taskType,title=@title,notes=@notes,due_on=@dueOn,status=@status,
                    completed_at=@completedAt,updated_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@id;`);
        await saasService.recordAudit({ tenantId, actorUserId: actorUserId(), action: 'trainer_task_updated', entityType: 'trainer_task', entityId: taskId, details: 'Trainer task updated.', before: { status: current.status }, after: { status: next.status }, executor: transaction });
        return next.memberId;
    });
    return (await listTasks({ memberId: result, includeDismissed: true, limit: 200, readOnly: true })).find((item) => item.id === taskId) || null;
}

async function dismissTask(taskIdValue) {
    return updateTask(taskIdValue, { status: 'dismissed' });
}

module.exports = {
    createGoal,
    createTemplate,
    createTask,
    deleteGoal,
    dismissTask,
    getNotifications,
    instantiateTemplate,
    listGoals,
    listTasks,
    listTemplates,
    setGoalStatus,
    taskStatus,
    updateGoal,
    updateTask,
    updateTemplate
};
