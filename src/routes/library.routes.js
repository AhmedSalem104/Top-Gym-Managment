'use strict';

const { createLibraryController } = require('../controllers/library.controller');

function registerLibraryRoutes(app, { libraryService, asyncRoute }) {
    const controller = createLibraryController({ libraryService });
    app.get('/api/library/options', asyncRoute(controller.options));
    app.get('/api/library/:type', asyncRoute(controller.collection));
    app.get('/api/library/:type/:id', asyncRoute(controller.item));
    app.post('/api/library/:type', asyncRoute(controller.create));
    app.put('/api/library/:type/:id', asyncRoute(controller.update));
    app.delete('/api/library/:type/:id', asyncRoute(controller.remove));
}

module.exports = { registerLibraryRoutes };
