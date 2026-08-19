'use strict';

const { createAttendanceController } = require('../controllers/attendance.controller');

function registerAttendanceRoutes(app, { attendanceService, asyncRoute }) {
    const controller = createAttendanceController({ attendanceService });
    app.get('/api/attendance', asyncRoute(controller.today));
    app.get('/api/attendance/report', asyncRoute(controller.report));
    app.get('/api/attendance/member/:id', asyncRoute(controller.member));
    app.post('/api/attendance/check-in', asyncRoute(controller.checkIn));
    app.post('/api/attendance/check-out', asyncRoute(controller.checkOut));
}

module.exports = { registerAttendanceRoutes };
