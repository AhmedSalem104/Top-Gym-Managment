'use strict';

const { resolveBranchContext } = require('../branches/branch-context');

function createAttendanceController({ attendanceService, branchService }) {
    const branchOptions = async (request, required = false) => {
        const context = await resolveBranchContext(request, { branchService, required, allowAll: !required });
        return { branchId: context.branchId, allBranches: context.allBranches };
    };
    return {
        today: async (request, response) => {
            const branch = await branchOptions(request);
            response.json(await attendanceService.getTodayAttendance({ date: request.query.date, search: request.query.search, readOnly: request.readOnlyRequest, ...branch }));
        },
        report: async (request, response) => {
            const branch = await branchOptions(request);
            response.json(await attendanceService.getAttendanceReport({ ...request.query, readOnly: request.readOnlyRequest, ...branch }));
        },
        member: async (request, response) => {
            const branch = await branchOptions(request);
            response.json(await attendanceService.getMemberAttendance(request.params.id, { ...request.query, readOnly: request.readOnlyRequest, ...branch }));
        },
        checkIn: async (request, response) => {
            const branch = await branchOptions(request, true);
            response.status(201).json(await attendanceService.checkIn(request.body, branch));
        },
        checkOut: async (request, response) => {
            const branch = await branchOptions(request, true);
            response.json(await attendanceService.checkOut(request.body, branch));
        }
    };
}

module.exports = { createAttendanceController };
