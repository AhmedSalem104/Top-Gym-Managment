'use strict';

const { createTrainerController } = require('../controllers/trainer.controller');
const { TENANT_TYPES } = require('../tenancy/tenant-types');

function trainerOnly(request, response, next) {
    if (request.tenant?.tenantType !== TENANT_TYPES.INDEPENDENT_TRAINER) {
        return response.status(404).json({ error: 'المسار غير متاح لهذا النوع من المساحات.', code: 'TRAINER_ROUTE_NOT_FOUND' });
    }
    return next();
}

function registerTrainerRoutes(app, { trainerService, trainerCommerceService, trainerStudioService, libraryService, intelligenceService, asyncRoute }) {
    const controller = createTrainerController({ trainerService, trainerCommerceService, trainerStudioService, libraryService, intelligenceService });
    const guard = [trainerOnly];
    app.get('/api/trainer/workspace', ...guard, asyncRoute(controller.workspace));
    app.get('/api/trainer/library/options', ...guard, asyncRoute(controller.libraryOptions));
    app.get('/api/trainer/library/catalog', ...guard, asyncRoute(controller.libraryCatalog));
    app.get('/api/trainer/library/:type', ...guard, asyncRoute(controller.libraryCollection));
    app.get('/api/trainer/library/:type/:id', ...guard, asyncRoute(controller.libraryItem));
    app.post('/api/trainer/intelligence/workout-suggestions', ...guard, asyncRoute(controller.workoutSuggestion));
    app.post('/api/trainer/intelligence/diet-suggestions', ...guard, asyncRoute(controller.dietSuggestion));
    app.post('/api/trainer/intelligence/refine', ...guard, asyncRoute(controller.refineSuggestion));
    app.get('/api/trainer/reports/summary', ...guard, asyncRoute(controller.reports));
    app.get('/api/trainer/clients', ...guard, asyncRoute(controller.clients));
    app.get('/api/trainer/follow-up', ...guard, asyncRoute(controller.followUp));
    app.post('/api/trainer/clients', ...guard, asyncRoute(controller.createClient));
    app.get('/api/trainer/clients/:id', ...guard, asyncRoute(controller.client));
    app.get('/api/trainer/clients/:id/timeline', ...guard, asyncRoute(controller.timeline));
    app.post('/api/trainer/clients/:id/portal-access', ...guard, asyncRoute(controller.portalAccess));
    app.patch('/api/trainer/clients/:id', ...guard, asyncRoute(controller.updateClient));
    app.delete('/api/trainer/clients/:id', ...guard, asyncRoute(controller.deleteClient));
    app.get('/api/trainer/clients/:id/measurements', ...guard, asyncRoute(controller.measurements));
    app.post('/api/trainer/clients/:id/measurements', ...guard, asyncRoute(controller.createMeasurement));
    app.patch('/api/trainer/clients/:id/measurements/:measurementId', ...guard, asyncRoute(controller.updateMeasurement));
    app.delete('/api/trainer/clients/:id/measurements/:measurementId', ...guard, asyncRoute(controller.deleteMeasurement));
    app.get('/api/trainer/clients/:id/checkins', ...guard, asyncRoute(controller.checkins));
    app.post('/api/trainer/clients/:id/checkins', ...guard, asyncRoute(controller.createCheckin));
    app.patch('/api/trainer/clients/:id/checkins/:checkinId', ...guard, asyncRoute(controller.updateCheckin));
    app.delete('/api/trainer/clients/:id/checkins/:checkinId', ...guard, asyncRoute(controller.deleteCheckin));
    app.get('/api/trainer/training-plans', ...guard, asyncRoute(controller.trainingPlans));
    app.post('/api/trainer/training-plans', ...guard, asyncRoute(controller.createTrainingPlan));
    app.patch('/api/trainer/training-plans/:id', ...guard, asyncRoute(controller.updateTrainingPlan));
    app.patch('/api/trainer/training-plans/:id/status', ...guard, asyncRoute(controller.setTrainingPlanStatus));
    app.delete('/api/trainer/training-plans/:id', ...guard, asyncRoute(controller.deleteTrainingPlan));
    app.get('/api/trainer/nutrition-plans', ...guard, asyncRoute(controller.nutritionPlans));
    app.post('/api/trainer/nutrition-plans', ...guard, asyncRoute(controller.createNutritionPlan));
    app.patch('/api/trainer/nutrition-plans/:id', ...guard, asyncRoute(controller.updateNutritionPlan));
    app.patch('/api/trainer/nutrition-plans/:id/status', ...guard, asyncRoute(controller.setNutritionPlanStatus));
    app.delete('/api/trainer/nutrition-plans/:id', ...guard, asyncRoute(controller.deleteNutritionPlan));
    app.get('/api/trainer/packages', ...guard, asyncRoute(controller.packages));
    app.post('/api/trainer/packages', ...guard, asyncRoute(controller.createPackage));
    app.patch('/api/trainer/packages/:id', ...guard, asyncRoute(controller.updatePackage));
    app.get('/api/trainer/package-purchases', ...guard, asyncRoute(controller.purchases));
    app.post('/api/trainer/package-purchases', ...guard, asyncRoute(controller.createPurchase));
    app.get('/api/trainer/payments', ...guard, asyncRoute(controller.payments));
    app.post('/api/trainer/package-purchases/:id/payments', ...guard, asyncRoute(controller.recordPayment));
    app.post('/api/trainer/package-purchases/:id/refunds', ...guard, asyncRoute(controller.refundPayment));
    app.get('/api/trainer/sessions', ...guard, asyncRoute(controller.sessions));
    app.post('/api/trainer/sessions', ...guard, asyncRoute(controller.createSession));
    app.patch('/api/trainer/sessions/:id', ...guard, asyncRoute(controller.updateSession));
    app.patch('/api/trainer/sessions/:id/status', ...guard, asyncRoute(controller.setSessionStatus));
    app.get('/api/trainer/goals', ...guard, asyncRoute(controller.goals));
    app.post('/api/trainer/goals', ...guard, asyncRoute(controller.createGoal));
    app.patch('/api/trainer/goals/:id', ...guard, asyncRoute(controller.updateGoal));
    app.patch('/api/trainer/goals/:id/status', ...guard, asyncRoute(controller.setGoalStatus));
    app.delete('/api/trainer/goals/:id', ...guard, asyncRoute(controller.deleteGoal));
    app.get('/api/trainer/notifications', ...guard, asyncRoute(controller.notifications));
    app.get('/api/trainer/tasks', ...guard, asyncRoute(controller.tasks));
    app.post('/api/trainer/tasks', ...guard, asyncRoute(controller.createTask));
    app.patch('/api/trainer/tasks/:id', ...guard, asyncRoute(controller.updateTask));
    app.post('/api/trainer/tasks/:id/dismiss', ...guard, asyncRoute(controller.dismissTask));
    app.get('/api/trainer/templates', ...guard, asyncRoute(controller.templates));
    app.post('/api/trainer/templates', ...guard, asyncRoute(controller.createTemplate));
    app.patch('/api/trainer/templates/:id', ...guard, asyncRoute(controller.updateTemplate));
    app.post('/api/trainer/templates/:id/instantiate', ...guard, asyncRoute(controller.instantiateTemplate));
}

module.exports = { registerTrainerRoutes, trainerOnly };
