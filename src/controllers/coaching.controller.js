'use strict';

function createCoachingController({ coachingService }) {
    return {
        externalTrainees: async (request, response) => {
            response.json(await coachingService.getExternalTrainees({
                search: request.query.search,
                page: request.query.page,
                pageSize: request.query.pageSize,
                readOnly: request.readOnlyRequest
            }));
        },
        createExternalTrainee: async (request, response) => {
            response.status(201).json({ member: await coachingService.createExternalTrainee(request.body) });
        },
        clients: async (request, response) => {
            response.json({ clients: await coachingService.getClientOptions({ search: request.query.search, limit: request.query.limit }) });
        },
        builderCatalog: async (request, response) => {
            response.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=300');
            response.json(await coachingService.getBuilderCatalog({ readOnly: request.readOnlyRequest }));
        },
        trainingOverview: async (request, response) => {
            response.json(await coachingService.getTrainingOverview(request.params.id, { readOnly: request.readOnlyRequest }));
        },
        trainingSummary: async (request, response) => {
            response.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60');
            response.json(await coachingService.getTrainingSummary(request.params.id, { readOnly: request.readOnlyRequest }));
        },
        updateClient: async (request, response) => {
            response.json({ member: await coachingService.updateClientBasic(request.params.id, request.body) });
        },
        measurements: async (request, response) => {
            response.json({ measurements: await coachingService.getMeasurements(request.params.id, { readOnly: request.readOnlyRequest }) });
        },
        createMeasurement: async (request, response) => {
            response.status(201).json({ measurement: await coachingService.createMeasurement(request.params.id, request.body) });
        },
        updateMeasurement: async (request, response) => {
            response.json({ measurement: await coachingService.updateMeasurement(request.params.id, request.params.measurementId, request.body) });
        },
        deleteMeasurement: async (request, response) => {
            await coachingService.deleteMeasurement(request.params.id, request.params.measurementId);
            response.status(204).send();
        },
        checkins: async (request, response) => {
            response.json({ checkins: await coachingService.getCheckins(request.params.id, { limit: request.query.limit, readOnly: request.readOnlyRequest }) });
        },
        createCheckin: async (request, response) => {
            response.status(201).json({ checkin: await coachingService.createCheckin(request.params.id, request.body) });
        },
        updateCheckin: async (request, response) => {
            response.json({ checkin: await coachingService.updateCheckin(request.params.id, request.params.checkinId, request.body) });
        },
        deleteCheckin: async (request, response) => {
            await coachingService.deleteCheckin(request.params.id, request.params.checkinId);
            response.status(204).send();
        },
        listWorkouts: async (request, response) => {
            response.json({ programs: await coachingService.getWorkoutPrograms({
                memberId: request.query.memberId || request.query.clientId,
                search: request.query.search,
                status: request.query.status,
                level: request.query.level,
                readOnly: request.readOnlyRequest
            }) });
        },
        getWorkout: async (request, response) => {
            response.json({ program: await coachingService.getWorkoutProgram(request.params.id, request.query.memberId || request.query.clientId, { readOnly: request.readOnlyRequest }) });
        },
        createWorkout: async (request, response) => {
            response.status(201).json({ program: await coachingService.createWorkoutProgram(request.body) });
        },
        updateWorkout: async (request, response) => {
            response.json({ program: await coachingService.updateWorkoutProgram(request.params.id, request.body) });
        },
        updateWorkoutStatus: async (request, response) => {
            response.json({ program: await coachingService.setWorkoutProgramStatus(request.params.id, request.body?.status) });
        },
        deleteWorkout: async (request, response) => {
            await coachingService.deleteWorkoutProgram(request.params.id);
            response.status(204).send();
        },
        listDiets: async (request, response) => {
            response.json({ plans: await coachingService.getDietPlans({
                memberId: request.query.memberId || request.query.clientId,
                search: request.query.search,
                status: request.query.status,
                readOnly: request.readOnlyRequest
            }) });
        },
        getDiet: async (request, response) => {
            response.json({ plan: await coachingService.getDietPlan(request.params.id, request.query.memberId || request.query.clientId, { readOnly: request.readOnlyRequest }) });
        },
        createDiet: async (request, response) => {
            response.status(201).json({ plan: await coachingService.createDietPlan(request.body) });
        },
        updateDiet: async (request, response) => {
            response.json({ plan: await coachingService.updateDietPlan(request.params.id, request.body) });
        },
        updateDietStatus: async (request, response) => {
            response.json({ plan: await coachingService.setDietPlanStatus(request.params.id, request.body?.status) });
        },
        deleteDiet: async (request, response) => {
            await coachingService.deleteDietPlan(request.params.id);
            response.status(204).send();
        },
        startWorkoutSession: async (request, response) => {
            response.status(201).json({ session: await coachingService.startWorkoutSession(request.body) });
        },
        listWorkoutSessions: async (request, response) => {
            response.json({ sessions: await coachingService.getWorkoutSessions(request.query.memberId || request.query.clientId, { ...request.query, readOnly: request.readOnlyRequest }) });
        },
        getWorkoutSession: async (request, response) => {
            response.json({ session: await coachingService.getWorkoutSession(request.params.id, { readOnly: request.readOnlyRequest }) });
        },
        addWorkoutSet: async (request, response) => {
            response.status(201).json({ set: await coachingService.addWorkoutSet(request.params.id, request.body) });
        },
        endWorkoutSession: async (request, response) => {
            response.json({ session: await coachingService.endWorkoutSession(request.params.id, request.body) });
        },
        createMealLog: async (request, response) => {
            response.status(201).json({ mealLog: await coachingService.createMealLog(request.body) });
        },
        listMealLogs: async (request, response) => {
            response.json({ mealLogs: await coachingService.getMealLogs(request.query.memberId || request.query.clientId, { ...request.query, readOnly: request.readOnlyRequest }) });
        }
    };
}

module.exports = { createCoachingController };
