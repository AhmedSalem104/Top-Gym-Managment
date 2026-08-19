'use strict';

const { createCoachingController } = require('../controllers/coaching.controller');

function registerCoachingRoutes(app, { coachingService, asyncRoute }) {
    const controller = createCoachingController({ coachingService });

    app.get('/api/external-trainees', asyncRoute(controller.externalTrainees));
    app.post('/api/external-trainees', asyncRoute(controller.createExternalTrainee));

    app.get('/api/coaching/clients', asyncRoute(controller.clients));
    app.get('/api/clients/:id/training-overview', asyncRoute(controller.trainingOverview));
    app.put('/api/clients/:id', asyncRoute(controller.updateClient));
    app.get('/api/clients/:id/measurements', asyncRoute(controller.measurements));
    app.post('/api/clients/:id/measurements', asyncRoute(controller.createMeasurement));
    app.put('/api/clients/:id/measurements/:measurementId', asyncRoute(controller.updateMeasurement));
    app.delete('/api/clients/:id/measurements/:measurementId', asyncRoute(controller.deleteMeasurement));
    app.get('/api/clients/:id/checkins', asyncRoute(controller.checkins));
    app.post('/api/clients/:id/checkins', asyncRoute(controller.createCheckin));
    app.put('/api/clients/:id/checkins/:checkinId', asyncRoute(controller.updateCheckin));
    app.delete('/api/clients/:id/checkins/:checkinId', asyncRoute(controller.deleteCheckin));

    for (const prefix of ['/api/workoutprograms', '/api/workout-programs']) {
        app.get(prefix, asyncRoute(controller.listWorkouts));
        app.get(`${prefix}/:id`, asyncRoute(controller.getWorkout));
        app.post(prefix, asyncRoute(controller.createWorkout));
        app.put(`${prefix}/:id`, asyncRoute(controller.updateWorkout));
        app.patch(`${prefix}/:id/status`, asyncRoute(controller.updateWorkoutStatus));
        app.delete(`${prefix}/:id`, asyncRoute(controller.deleteWorkout));
    }

    for (const prefix of ['/api/dietplans', '/api/diet-plans']) {
        app.get(prefix, asyncRoute(controller.listDiets));
        app.get(`${prefix}/:id`, asyncRoute(controller.getDiet));
        app.post(prefix, asyncRoute(controller.createDiet));
        app.put(`${prefix}/:id`, asyncRoute(controller.updateDiet));
        app.patch(`${prefix}/:id/status`, asyncRoute(controller.updateDietStatus));
        app.delete(`${prefix}/:id`, asyncRoute(controller.deleteDiet));
    }

    app.post('/api/workoutsessions/start', asyncRoute(controller.startWorkoutSession));
    app.get('/api/workoutsessions', asyncRoute(controller.listWorkoutSessions));
    app.get('/api/workoutsessions/:id', asyncRoute(controller.getWorkoutSession));
    app.post('/api/workoutsessions/:id/sets', asyncRoute(controller.addWorkoutSet));
    app.post('/api/workoutsessions/:id/end', asyncRoute(controller.endWorkoutSession));
    app.post('/api/meal-logs', asyncRoute(controller.createMealLog));
    app.get('/api/meal-logs', asyncRoute(controller.listMealLogs));
}

module.exports = { registerCoachingRoutes };
