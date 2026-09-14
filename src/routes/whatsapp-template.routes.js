'use strict';

const { createWhatsappTemplateController } = require('../controllers/whatsapp-template.controller');
const { requirePermission } = require('../middleware/permission.middleware');
const { platformOnly } = require('../middleware/platform.middleware');

function registerWhatsappTemplateRoutes(app, { whatsappTemplateService, asyncRoute }) {
    const controller = createWhatsappTemplateController({ whatsappTemplateService });
    const ownerTemplateAccess = requirePermission('message_templates.manage', { ownerOnly: true });
    app.get('/api/whatsapp-templates', ownerTemplateAccess, asyncRoute(controller.listTenant));
    app.get('/api/whatsapp-templates/:templateId', ownerTemplateAccess, asyncRoute(controller.getTenant));
    app.put('/api/whatsapp-templates/:templateId', ownerTemplateAccess, asyncRoute(controller.saveTenant));
    app.post('/api/whatsapp-templates/:templateId/restore-default', ownerTemplateAccess, asyncRoute(controller.restoreTenant));

    app.get('/api/platform/whatsapp-templates', platformOnly, asyncRoute(controller.listSystem));
    app.put('/api/platform/whatsapp-templates/:templateId', platformOnly, asyncRoute(controller.saveSystem));
    app.post('/api/platform/whatsapp-templates/:templateId/restore-default', platformOnly, asyncRoute(controller.restoreSystem));
}

module.exports = { registerWhatsappTemplateRoutes };
