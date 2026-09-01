'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getPool } = require('../database');

const MIGRATION_PATH = path.join(__dirname, '..', '..', 'database', 'migrations', '011-commercial-portal-and-registration.sql');
const TRAINER_REGISTRATION_MIGRATION_PATH = path.join(__dirname, '..', '..', 'database', 'migrations', '016-independent-trainer-registration.sql');
const TRAINER_CLIENT_PROFILE_MIGRATION_PATH = path.join(__dirname, '..', '..', 'database', 'migrations', '017-trainer-client-profile.sql');
const TRAINER_COMMERCIAL_OPERATIONS_MIGRATION_PATH = path.join(__dirname, '..', '..', 'database', 'migrations', '018-trainer-commercial-operations.sql');
const TRAINER_PORTAL_FOUNDATION_MIGRATION_PATH = path.join(__dirname, '..', '..', 'database', 'migrations', '019-trainer-portal-foundation.sql');
let readyPromise;

async function ensureCommercialTables({ readOnly = false } = {}) {
    // Public/read-only requests must never create commercial tables as a side
    // effect. The guarded migration is applied by startup/migration workflows.
    if (readOnly) return;
    if (!readyPromise) {
        readyPromise = (async () => {
            const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
            const trainerRegistrationMigration = fs.readFileSync(TRAINER_REGISTRATION_MIGRATION_PATH, 'utf8');
            const trainerClientProfileMigration = fs.readFileSync(TRAINER_CLIENT_PROFILE_MIGRATION_PATH, 'utf8');
            const trainerCommercialOperationsMigration = fs.readFileSync(TRAINER_COMMERCIAL_OPERATIONS_MIGRATION_PATH, 'utf8');
            const trainerPortalFoundationMigration = fs.readFileSync(TRAINER_PORTAL_FOUNDATION_MIGRATION_PATH, 'utf8');
            const pool = await getPool();
            await pool.request().batch(migration);
            await pool.request().batch(trainerRegistrationMigration);
            await pool.request().batch(trainerClientProfileMigration);
            await pool.request().batch(trainerCommercialOperationsMigration);
            await pool.request().batch(trainerPortalFoundationMigration);
        })().catch((error) => {
            readyPromise = undefined;
            throw error;
        });
    }
    return readyPromise;
}

function resetCommercialSchemaReadiness() {
    readyPromise = undefined;
}

module.exports = { ensureCommercialTables, resetCommercialSchemaReadiness, MIGRATION_PATH, TRAINER_REGISTRATION_MIGRATION_PATH, TRAINER_CLIENT_PROFILE_MIGRATION_PATH, TRAINER_COMMERCIAL_OPERATIONS_MIGRATION_PATH, TRAINER_PORTAL_FOUNDATION_MIGRATION_PATH };
