'use strict';

const PERMISSIONS = Object.freeze({
    ALL: '*',
    MEMBERS_READ: 'members.read',
    MEMBERS_MANAGE: 'members.manage',
    TRAINEES_READ: 'trainees.read',
    TRAINEES_MANAGE: 'trainees.manage',
    ATTENDANCE_READ: 'attendance.read',
    ATTENDANCE_MANAGE: 'attendance.manage',
    LIBRARY_READ: 'library.read',
    LIBRARY_MANAGE: 'library.manage',
    PRICING_READ: 'pricing.read',
    DAY_PASSES_READ: 'day_passes.read',
    DAY_PASSES_MANAGE: 'day_passes.manage',
    DAY_PASS_PRICING_MANAGE: 'day_passes.pricing.manage',
    DAY_PASSES_VOID: 'day_passes.void'
});

module.exports = { PERMISSIONS };
