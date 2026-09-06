'use strict';

function createTrainerController({ trainerService, trainerCommerceService, trainerStudioService, libraryService, intelligenceService }) {
    return {
        workspace: async (request, response) => response.json(await trainerService.getWorkspace({ readOnly: request.readOnlyRequest })),
        libraryOptions: async (request, response) => {
            response.set('Cache-Control', 'private, max-age=20, stale-while-revalidate=60');
            response.json(await libraryService.getLibraryOptions({ readOnly: request.readOnlyRequest }));
        },
        libraryCatalog: async (request, response) => {
            response.set('Cache-Control', 'private, max-age=20, stale-while-revalidate=60');
            const [options, exercises, foods, muscles] = await Promise.all([
                libraryService.getLibraryOptions({ readOnly: request.readOnlyRequest }),
                libraryService.getLibraryCollection('exercises', { page: 1, pageSize: 100 }, { readOnly: request.readOnlyRequest }),
                libraryService.getLibraryCollection('foods', { page: 1, pageSize: 100 }, { readOnly: request.readOnlyRequest }),
                libraryService.getLibraryCollection('muscles', { page: 1, pageSize: 100 }, { readOnly: request.readOnlyRequest })
            ]);
            response.json({ options, exercises: exercises.items, foods: foods.items, muscles: muscles.items, pagination: { exercises: exercises.pagination, foods: foods.pagination, muscles: muscles.pagination } });
        },
        libraryCollection: async (request, response) => {
            response.set('Cache-Control', 'private, max-age=20, stale-while-revalidate=60');
            response.json(await libraryService.getLibraryCollection(request.params.type, request.query, { readOnly: request.readOnlyRequest }));
        },
        libraryItem: async (request, response) => response.json({ item: await libraryService.getLibraryItem(request.params.type, request.params.id, { readOnly: request.readOnlyRequest }) }),
        workoutSuggestion: async (request, response) => response.status(201).json(await intelligenceService.generateWorkoutSuggestion(request.body || {}, { actorUserId: request.auth?.id })),
        dietSuggestion: async (request, response) => response.status(201).json(await intelligenceService.generateDietSuggestion(request.body || {}, { actorUserId: request.auth?.id })),
        refineSuggestion: async (request, response) => response.status(201).json(await intelligenceService.refineSuggestion(request.body || {}, { actorUserId: request.auth?.id })),
        reports: async (request, response) => response.json(await trainerService.getReports({ from: request.query.from, to: request.query.to, readOnly: request.readOnlyRequest })),
        clients: async (request, response) => response.json(await trainerService.listClients({ search: request.query.search, page: request.query.page, pageSize: request.query.pageSize, readOnly: request.readOnlyRequest })),
        followUp: async (request, response) => response.json(await trainerService.getFollowUp({ limit: request.query.limit, readOnly: request.readOnlyRequest })),
        client: async (request, response) => response.json(await trainerService.getClient(request.params.id, { readOnly: request.readOnlyRequest })),
        timeline: async (request, response) => response.json(await trainerService.getClientTimeline(request.params.id, { limit: request.query.limit, readOnly: request.readOnlyRequest })),
        portalAccess: async (request, response) => response.json(await trainerService.getClientPortalAccess(request.params.id, { request, userId: request.auth?.id })),
        createClient: async (request, response) => response.status(201).json({ client: await trainerService.createClient(request.body || {}) }),
        updateClient: async (request, response) => response.json({ client: await trainerService.updateClient(request.params.id, request.body || {}) }),
        deleteClient: async (request, response) => { await trainerService.deleteClient(request.params.id); response.status(204).send(); },
        measurements: async (request, response) => response.json({ measurements: await trainerService.getMeasurements(request.params.id, { readOnly: request.readOnlyRequest }) }),
        createMeasurement: async (request, response) => response.status(201).json({ measurement: await trainerService.createMeasurement(request.params.id, request.body || {}) }),
        updateMeasurement: async (request, response) => response.json({ measurement: await trainerService.updateMeasurement(request.params.id, request.params.measurementId, request.body || {}) }),
        deleteMeasurement: async (request, response) => { await trainerService.deleteMeasurement(request.params.id, request.params.measurementId); response.status(204).send(); },
        checkins: async (request, response) => response.json({ checkins: await trainerService.getCheckins(request.params.id, { limit: request.query.limit, readOnly: request.readOnlyRequest }) }),
        createCheckin: async (request, response) => response.status(201).json({ checkin: await trainerService.createCheckin(request.params.id, request.body || {}) }),
        updateCheckin: async (request, response) => response.json({ checkin: await trainerService.updateCheckin(request.params.id, request.params.checkinId, request.body || {}) }),
        deleteCheckin: async (request, response) => { await trainerService.deleteCheckin(request.params.id, request.params.checkinId); response.status(204).send(); },
        trainingPlans: async (request, response) => response.json({ plans: await trainerService.listTrainingPlans({ memberId: request.query.memberId || request.query.clientId, search: request.query.search, status: request.query.status, level: request.query.level, readOnly: request.readOnlyRequest }) }),
        createTrainingPlan: async (request, response) => response.status(201).json({ plan: await trainerService.createTrainingPlan(request.body || {}) }),
        updateTrainingPlan: async (request, response) => response.json({ plan: await trainerService.updateTrainingPlan(request.params.id, request.body || {}) }),
        setTrainingPlanStatus: async (request, response) => response.json({ plan: await trainerService.setTrainingPlanStatus(request.params.id, request.body?.status) }),
        deleteTrainingPlan: async (request, response) => { await trainerService.deleteTrainingPlan(request.params.id); response.status(204).send(); },
        nutritionPlans: async (request, response) => response.json({ plans: await trainerService.listNutritionPlans({ memberId: request.query.memberId || request.query.clientId, search: request.query.search, status: request.query.status, readOnly: request.readOnlyRequest }) }),
        createNutritionPlan: async (request, response) => response.status(201).json({ plan: await trainerService.createNutritionPlan(request.body || {}) }),
        updateNutritionPlan: async (request, response) => response.json({ plan: await trainerService.updateNutritionPlan(request.params.id, request.body || {}) }),
        setNutritionPlanStatus: async (request, response) => response.json({ plan: await trainerService.setNutritionPlanStatus(request.params.id, request.body?.status) }),
        deleteNutritionPlan: async (request, response) => { await trainerService.deleteNutritionPlan(request.params.id); response.status(204).send(); }
        ,packages: async (request, response) => response.json({ packages: await trainerCommerceService.listPackages({ includeArchived: request.query.includeArchived === 'true', readOnly: request.readOnlyRequest }) })
        ,createPackage: async (request, response) => response.status(201).json({ package: await trainerCommerceService.createPackage(request.body || {}) })
        ,updatePackage: async (request, response) => response.json({ package: await trainerCommerceService.updatePackage(request.params.id, request.body || {}) })
        ,purchases: async (request, response) => response.json({ purchases: await trainerCommerceService.listPurchases({ memberId: request.query.memberId || request.query.clientId, status: request.query.status, readOnly: request.readOnlyRequest }) })
        ,createPurchase: async (request, response) => response.status(201).json({ purchase: await trainerCommerceService.createPurchase({ ...(request.body || {}), idempotencyKey: request.get('idempotency-key') || request.body?.idempotencyKey }) })
        ,payments: async (request, response) => response.json({ payments: await trainerCommerceService.listPayments({ purchaseId: request.query.purchaseId, memberId: request.query.memberId || request.query.clientId, readOnly: request.readOnlyRequest }) })
        ,recordPayment: async (request, response) => response.status(201).json({ payment: await trainerCommerceService.recordPayment(request.params.id, { ...(request.body || {}), idempotencyKey: request.get('idempotency-key') || request.body?.idempotencyKey }) })
        ,refundPayment: async (request, response) => response.status(201).json({ refund: await trainerCommerceService.refundPayment(request.params.id, { ...(request.body || {}), idempotencyKey: request.get('idempotency-key') || request.body?.idempotencyKey }) })
        ,sessions: async (request, response) => response.json({ sessions: await trainerCommerceService.listSessions({ memberId: request.query.memberId || request.query.clientId, from: request.query.from, to: request.query.to, readOnly: request.readOnlyRequest }) })
        ,createSession: async (request, response) => response.status(201).json({ session: await trainerCommerceService.createSession({ ...(request.body || {}), idempotencyKey: request.get('idempotency-key') || request.body?.idempotencyKey }) })
        ,updateSession: async (request, response) => response.json({ session: await trainerCommerceService.updateSession(request.params.id, request.body || {}) })
        ,setSessionStatus: async (request, response) => response.json({ session: await trainerCommerceService.setSessionStatus(request.params.id, request.body?.status) })
        ,goals: async (request, response) => response.json({ goals: await trainerStudioService.listGoals({ memberId: request.query.memberId || request.query.clientId, status: request.query.status, includeArchived: request.query.includeArchived === 'true', readOnly: request.readOnlyRequest }) })
        ,createGoal: async (request, response) => response.status(201).json({ goal: await trainerStudioService.createGoal(request.body || {}) })
        ,updateGoal: async (request, response) => response.json({ goal: await trainerStudioService.updateGoal(request.params.id, request.body || {}) })
        ,setGoalStatus: async (request, response) => response.json({ goal: await trainerStudioService.setGoalStatus(request.params.id, request.body?.status) })
        ,deleteGoal: async (request, response) => { await trainerStudioService.deleteGoal(request.params.id); response.status(204).send(); }
        ,notifications: async (request, response) => response.json(await trainerStudioService.getNotifications({ limit: request.query.limit }))
        ,tasks: async (request, response) => response.json({ tasks: await trainerStudioService.listTasks({ memberId: request.query.memberId || request.query.clientId, status: request.query.status, includeDismissed: request.query.includeDismissed === 'true', limit: request.query.limit, readOnly: request.readOnlyRequest }) })
        ,createTask: async (request, response) => response.status(201).json({ task: await trainerStudioService.createTask({ ...(request.body || {}), idempotencyKey: request.get('idempotency-key') || request.body?.idempotencyKey }) })
        ,updateTask: async (request, response) => response.json({ task: await trainerStudioService.updateTask(request.params.id, request.body || {}) })
        ,dismissTask: async (request, response) => response.json({ task: await trainerStudioService.dismissTask(request.params.id) })
        ,templates: async (request, response) => response.json({ templates: await trainerStudioService.listTemplates({ type: request.query.type, includeArchived: request.query.includeArchived === 'true' }) })
        ,createTemplate: async (request, response) => response.status(201).json({ template: await trainerStudioService.createTemplate({ ...(request.body || {}), idempotencyKey: request.get('idempotency-key') || request.body?.idempotencyKey }) })
        ,updateTemplate: async (request, response) => response.json({ template: await trainerStudioService.updateTemplate(request.params.id, request.body || {}) })
        ,instantiateTemplate: async (request, response) => response.status(201).json({ resource: await trainerStudioService.instantiateTemplate(request.params.id, request.body || {}) })
    };
}

module.exports = { createTrainerController };
