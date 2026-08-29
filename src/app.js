'use strict';

const path = require('node:path');
const express = require('express');
const { config } = require('./config/env');
const { createBaseApp } = require('./middleware/security.middleware');

function createApp({ publicDirectory = path.join(__dirname, '..', 'public'), expressFactory = express } = {}) {
    return createBaseApp({ publicDirectory, expressFactory, trustProxyHops: config.trustProxyHops });
}

module.exports = { createApp };
