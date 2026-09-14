'use strict';

function createWhatsappTemplateController({ whatsappTemplateService }) {
    return {
        listTenant: async (request, response) => response.json({ templates: await whatsappTemplateService.listTenantTemplates(request.tenant?.id) }),
        listRuntime: async (request, response) => response.json({ templates: await whatsappTemplateService.listTenantTemplates(request.tenant?.id) }),
        getTenant: async (request, response) => response.json({ template: await whatsappTemplateService.getEffectiveTemplate(request.params.templateId, { tenantId: request.tenant?.id }) }),
        saveTenant: async (request, response) => response.json({ template: await whatsappTemplateService.saveTenantOverride(request.params.templateId, request.body?.body, { tenantId: request.tenant?.id, userId: request.auth?.id }) }),
        restoreTenant: async (request, response) => response.json({ template: await whatsappTemplateService.restoreTenantDefault(request.params.templateId, { tenantId: request.tenant?.id }) }),
        listSystem: async (_request, response) => response.json({ templates: await whatsappTemplateService.listSystemTemplates() }),
        saveSystem: async (request, response) => response.json({ template: await whatsappTemplateService.saveSystemDefault(request.params.templateId, request.body?.body, { userId: request.auth?.id }) }),
        restoreSystem: async (request, response) => response.json({ template: await whatsappTemplateService.restoreSystemDefault(request.params.templateId) })
    };
}

module.exports = { createWhatsappTemplateController };
