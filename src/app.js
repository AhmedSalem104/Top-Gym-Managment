'use strict';

const path = require('node:path');
const { createBaseApp } = require('./middleware/security.middleware');

function createApp({ publicDirectory = path.join(__dirname, '..', 'public') } = {}) {
    return createBaseApp({ publicDirectory });
}

module.exports = { createApp };
