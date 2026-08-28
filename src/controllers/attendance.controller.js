'use strict';

function createAttendanceController({ attendanceService }) {
    return {
        today: async (request, response) => {
            response.json(await attendanceService.getTodayAttendance({ date: request.query.date, search: request.query.search, readOnly: request.readOnlyBaseline }));
        },
        report: async (request, response) => {
            response.json(await attendanceService.getAttendanceReport({ ...request.query, readOnly: request.readOnlyBaseline }));
        },
        member: async (request, response) => {
            response.json(await attendanceService.getMemberAttendance(request.params.id, { ...request.query, readOnly: request.readOnlyBaseline }));
        },
        checkIn: async (request, response) => {
            response.status(201).json(await attendanceService.checkIn(request.body));
        },
        checkOut: async (request, response) => {
            response.json(await attendanceService.checkOut(request.body));
        }
    };
}

module.exports = { createAttendanceController };
