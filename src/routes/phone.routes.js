'use strict';

const phoneService = require('../services/phone-service');

function registerPhoneRoutes(app, { asyncRoute, countryDetectionService = null }) {
    // Public metadata is needed by registration and authenticated forms alike.
    // It contains no tenant data and is safe to cache at the edge/browser.
    app.get('/api/phone/countries', asyncRoute(async (_request, response) => {
        response.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        response.json({ countries: phoneService.getSupportedCountries() });
    }));

    // Keep IP geolocation server-side. The browser receives an ISO code only;
    // an unavailable provider is a normal signal failure handled by the
    // timezone/locale/fallback chain in the central phone component.
    app.get('/api/phone/country', asyncRoute(async (request, response) => {
        response.set('Cache-Control', 'private, no-store');
        const countryCode = countryDetectionService?.detectCountryCode
            ? await countryDetectionService.detectCountryCode(request)
            : '';
        response.json({ countryCode: countryCode || null });
    }));
}

module.exports = { registerPhoneRoutes };
