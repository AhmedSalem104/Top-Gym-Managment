'use strict';

const phoneService = require('../services/phone-service');

function registerPhoneRoutes(app, { asyncRoute }) {
    // Public metadata is needed by registration and authenticated forms alike.
    // It contains no tenant data and is safe to cache at the edge/browser.
    app.get('/api/phone/countries', asyncRoute(async (_request, response) => {
        response.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        response.json({ countries: phoneService.getSupportedCountries() });
    }));
}

module.exports = { registerPhoneRoutes };
