'use strict';

function createLibraryController({ libraryService }) {
    return {
        options: async (request, response) => {
            response.set('Cache-Control', 'private, max-age=20, stale-while-revalidate=60');
            response.json(await libraryService.getLibraryOptions({ readOnly: request.readOnlyBaseline }));
        },
        collection: async (request, response) => {
            response.set('Cache-Control', 'private, max-age=20, stale-while-revalidate=60');
            response.json(await libraryService.getLibraryCollection(request.params.type, request.query, { readOnly: request.readOnlyBaseline }));
        },
        item: async (request, response) => {
            response.json({ item: await libraryService.getLibraryItem(request.params.type, request.params.id, { readOnly: request.readOnlyBaseline }) });
        },
        create: async (request, response) => {
            response.status(201).json({ item: await libraryService.createLibraryItem(request.params.type, request.body) });
        },
        update: async (request, response) => {
            response.json({ item: await libraryService.updateLibraryItem(request.params.type, request.params.id, request.body) });
        },
        remove: async (request, response) => {
            await libraryService.deleteLibraryItem(request.params.type, request.params.id);
            response.status(204).send();
        }
    };
}

module.exports = { createLibraryController };
