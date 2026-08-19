'use strict';

function createAttendanceController({ attendanceService }) {
    return {
        today: async (request, response) => {
            response.json(await attendanceService.getTodayAttendance({ date: request.query.date, search: request.query.search }));
        },
        report: async (request, response) => {
            response.json(await attendanceService.getAttendanceReport(request.query));
        },
        member: async (request, response) => {
            response.json(await attendanceService.getMemberAttendance(request.params.id, request.query));
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
