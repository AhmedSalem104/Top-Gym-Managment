'use strict';

function createMemberFeedbackController({ feedbackService }) {
    return {
        submit: async (request, response) => {
            response.status(201).json(await feedbackService.submitFromPortal({
                membershipCode: request.body?.membershipCode,
                rating: request.body?.rating,
                noteType: request.body?.noteType,
                message: request.body?.message,
                request
            }));
        },

        list: async (request, response) => {
            response.json(await feedbackService.list(request.query, { readOnly: request.readOnlyRequest }));
        }
    };
}

module.exports = { createMemberFeedbackController };
