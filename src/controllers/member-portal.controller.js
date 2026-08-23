'use strict';

const LIBRARY_TYPES = new Set(['muscles', 'foods', 'exercises']);

function safeAssetPath(value) {
    const candidate = String(value || '').trim();
    return candidate.startsWith('/assets/') ? candidate : null;
}

function publicImageAssets(value) {
    if (!value || typeof value !== 'object') return null;
    const assets = {};
    for (const key of ['main', 'start', 'end', 'front', 'back', 'side']) {
        const path = safeAssetPath(value[key]);
        if (path) assets[key] = path;
    }
    return Object.keys(assets).length ? assets : null;
}

function publicLibraryItem(type, item, detailed = false) {
    if (!item) return null;
    if (type === 'muscles') {
        return {
            id: item.id,
            name: item.name,
            nameAr: item.nameAr,
            bodyPart: item.bodyPart,
            description: detailed ? item.description : null,
            descriptionAr: detailed ? item.descriptionAr : null,
            icon: item.icon
        };
    }
    if (type === 'foods') {
        return {
            id: item.id,
            nameAr: item.nameAr,
            nameEn: item.nameEn,
            category: item.category,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            fiber: item.fiber,
            sugar: item.sugar,
            sodium: item.sodium,
            servingSize: item.servingSize,
            servingUnit: item.servingUnit
        };
    }
    return {
        id: item.id,
        name: item.name,
        nameAr: item.nameAr,
        description: detailed ? item.description : null,
        descriptionAr: detailed ? item.descriptionAr : null,
        targetMuscleId: item.targetMuscleId,
        targetMuscleName: item.targetMuscleName,
        targetMuscleNameAr: item.targetMuscleNameAr,
        secondaryMuscleDetails: detailed ? item.secondaryMuscleDetails : [],
        equipment: item.equipment,
        isHighImpact: item.isHighImpact,
        difficulty: item.difficulty,
        category: item.category,
        movementPattern: detailed ? item.movementPattern : null,
        mechanic: detailed ? item.mechanic : null,
        force: detailed ? item.force : null,
        instructionsAr: detailed ? item.instructionsAr : [],
        tipsAr: detailed ? item.tipsAr : [],
        commonMistakesAr: detailed ? item.commonMistakesAr : [],
        repsRange: item.repsRange,
        setsRange: item.setsRange,
        restSeconds: item.restSeconds,
        tempo: item.tempo,
        icon: item.icon,
        imageAssets: publicImageAssets(item.imageAssets)
    };
}

function createMemberPortalController({ membershipCodeService, portalService, libraryService }) {
    return {
        lookup: async (request, response) => {
            response.json(await portalService.lookupByCode(request.body?.membershipCode, request));
        },

        libraryOptions: async (_request, response) => {
            response.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
            const options = await libraryService.getLibraryOptions();
            response.json({
                counts: options.counts,
                filters: {
                    bodyParts: options.filters.bodyParts,
                    categories: options.filters.categories,
                    exerciseCategories: options.filters.exerciseCategories,
                    difficulties: options.filters.difficulties,
                    equipment: options.filters.equipment,
                    muscles: options.filters.muscles.map((item) => ({ id: item.id, name: item.name, nameAr: item.nameAr }))
                }
            });
        },

        libraryCollection: async (request, response) => {
            const type = String(request.params.type || '').toLowerCase();
            if (!LIBRARY_TYPES.has(type)) return response.status(404).json({ error: 'Library type not found.' });
            const query = { ...request.query, pageSize: Math.min(Number(request.query.pageSize) || 18, 24) };
            const result = await libraryService.getLibraryCollection(type, query);
            response.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
            response.json({
                items: result.items.map((item) => publicLibraryItem(type, item)),
                pagination: result.pagination
            });
        },

        libraryItem: async (request, response) => {
            const type = String(request.params.type || '').toLowerCase();
            if (!LIBRARY_TYPES.has(type)) return response.status(404).json({ error: 'Library type not found.' });
            const item = await libraryService.getLibraryItem(type, request.params.id);
            response.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
            response.json({ item: publicLibraryItem(type, item, true) });
        },

        getCode: async (request, response) => {
            response.json(await membershipCodeService.getPreview(request.params.id));
        },

        revealCode: async (request, response) => {
            response.json(await membershipCodeService.getForMember(request.params.id, {
                userId: request.auth?.id,
                request,
                action: 'viewed'
            }));
        },

        resend: async (request, response) => {
            response.json({
                ...await membershipCodeService.getForMember(request.params.id, {
                    userId: request.auth?.id,
                    request,
                    action: 'whatsapp_sent'
                }),
                portalUrl: membershipCodeService.getPortalUrl(`${request.protocol}://${request.get('host')}`)
            });
        },

        rotate: async (request, response) => {
            response.json({
                ...await membershipCodeService.rotateForMember(request.params.id, {
                    userId: request.auth?.id,
                    request
                }),
                portalUrl: membershipCodeService.getPortalUrl(`${request.protocol}://${request.get('host')}`)
            });
        }
    };
}

module.exports = { createMemberPortalController };
