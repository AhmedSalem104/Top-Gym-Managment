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
    PRICING_READ: 'pricing.read'
});

module.exports = { PERMISSIONS };
