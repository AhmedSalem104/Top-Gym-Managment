require('dotenv').config();

const { closePool } = require('../src/db');
const { syncLibraryData } = require('../src/library-service');

(async () => {
    try {
        const counts = await syncLibraryData();
        console.log(`LIBRARY_SYNC_OK muscles=${counts.muscles} foods=${counts.foods} exercises=${counts.exercises}`);
    } catch (error) {
        console.error('LIBRARY_SYNC_FAILED:', error.message);
        process.exitCode = 1;
    } finally {
        await closePool();
    }
})();
