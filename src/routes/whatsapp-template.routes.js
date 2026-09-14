'use strict';

const { createWhatsappTemplateController } = require('../controllers/whatsapp-template.controller');
const { requirePermission } = require('../middleware/permission.middleware');
const { platformOnly } = require('../middleware/platform.middleware');

function registerWhatsappTemplateRoutes(app, { whatsappTemplateService, asyncRoute }) {
    const controller = createWhatsappTemplateController({ whatsappTemplateService });
    const runtimeTemplateAccess = requirePermission('__whatsapp_templates_runtime__');
    const tenantManagementDisabled = (_request, response) => response.status(403).json({
        error: 'قوالب WhatsApp تدار مركزيًا من منصة Logic Fit فقط.',
        code: 'PLATFORM_TEMPLATES_ONLY'
    });
    app.get('/api/whatsapp-templates/runtime', runtimeTemplateAccess, asyncRoute(controller.listRuntime));
    // Keep the legacy namespace as an explicit policy boundary. Existing
    // tables and historical overrides are retained, but tenant management is
    // no longer an available product capability.
    app.use('/api/whatsapp-templates', tenantManagementDisabled);

    app.get('/api/platform/whatsapp-templates', platformOnly, asyncRoute(controller.listSystem));
    app.put('/api/platform/whatsapp-templates/:templateId', platformOnly, asyncRoute(controller.saveSystem));
    app.post('/api/platform/whatsapp-templates/:templateId/restore-default', platformOnly, asyncRoute(controller.restoreSystem));
}

module.exports = { registerWhatsappTemplateRoutes };
