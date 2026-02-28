const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

const required = [
    'BASE_URL',
    'CS_EMAIL_USER',
    'CS_EMAIL_PASS',
    'NCS_EMAIL_USER',
    'NCS_EMAIL_PASS',
];

const testMode = process.env.TEST_MODE === 'true';

// Sheet IDs required based on mode
const requiredSheets = testMode ? [
    'TEST_CS_EVENTS_SHEET_ID',
    'TEST_CS_WORKSHOP_SHEET_ID', 
    'TEST_CS_HACKATHON_SHEET_ID',
    'TEST_NCS_EVENTS_SHEET_ID',
    'TEST_NCS_WORKSHOP_SHEET_ID',
    'TEST_NCS_HACKATHON_SHEET_ID',
] : [
    'CS_EVENTS_SHEET_ID',
    'CS_WORKSHOP_SHEET_ID',
    'CS_HACKATHON_SHEET_ID',
    'NCS_EVENTS_SHEET_ID',
    'NCS_WORKSHOP_SHEET_ID',
    'NCS_HACKATHON_SHEET_ID',
];

const allRequired = [...required, ...requiredSheets];

console.log(`[Env] TEST_MODE: ${testMode ? 'ENABLED' : 'DISABLED'}`);

const fs = require('fs');

// Automatically load service account credentials if missing
if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
        const keyPath = path.join(__dirname, '../../', process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        if (fs.existsSync(keyPath)) {
            process.env.GOOGLE_SERVICE_ACCOUNT_JSON = fs.readFileSync(keyPath, 'utf8');
            console.log('[Env] Loaded service account credentials from file');
        }
    } catch (err) {
        console.error('[Env] Failed to load service account key file:', err.message);
    }
}

const validateEnv = () => {
    const missing = allRequired.filter((key) => !process.env[key] || String(process.env[key]).trim() === '');
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).trim() === '') {
        missing.push('GOOGLE_SERVICE_ACCOUNT_JSON');
    }
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables for ${testMode ? 'TEST' : 'PRODUCTION'} mode: ${missing.join(', ')}`);
    }

    // Log which sheets are being used
    const sheets = testMode ? {
        csEvents: process.env.TEST_CS_EVENTS_SHEET_ID,
        csWorkshop: process.env.TEST_CS_WORKSHOP_SHEET_ID,
        csHackathon: process.env.TEST_CS_HACKATHON_SHEET_ID,
        ncsEvents: process.env.TEST_NCS_EVENTS_SHEET_ID,
        ncsWorkshop: process.env.TEST_NCS_WORKSHOP_SHEET_ID,
        ncsHackathon: process.env.TEST_NCS_HACKATHON_SHEET_ID,
    } : {
        csEvents: process.env.CS_EVENTS_SHEET_ID,
        csWorkshop: process.env.CS_WORKSHOP_SHEET_ID,
        csHackathon: process.env.CS_HACKATHON_SHEET_ID,
        ncsEvents: process.env.NCS_EVENTS_SHEET_ID,
        ncsWorkshop: process.env.NCS_WORKSHOP_SHEET_ID,
        ncsHackathon: process.env.NCS_HACKATHON_SHEET_ID,
    };

    console.log(`[Env] Active Sheet IDs:`, sheets);
};

const env = {
    port: process.env.PORT || '3000',
    baseUrl: String(process.env.BASE_URL || '').trim().replace(/\/$/, ''),
    testMode,
    csSheets: {
        events: String(testMode ? process.env.TEST_CS_EVENTS_SHEET_ID : process.env.CS_EVENTS_SHEET_ID || '').trim(),
        workshop: String(testMode ? process.env.TEST_CS_WORKSHOP_SHEET_ID : process.env.CS_WORKSHOP_SHEET_ID || '').trim(),
        hackathon: String(testMode ? process.env.TEST_CS_HACKATHON_SHEET_ID : process.env.CS_HACKATHON_SHEET_ID || '').trim(),
    },
    ncsSheets: {
        events: String(testMode ? process.env.TEST_NCS_EVENTS_SHEET_ID : process.env.NCS_EVENTS_SHEET_ID || '').trim(),
        workshop: String(testMode ? process.env.TEST_NCS_WORKSHOP_SHEET_ID : process.env.NCS_WORKSHOP_SHEET_ID || '').trim(),
        hackathon: String(testMode ? process.env.TEST_NCS_HACKATHON_SHEET_ID : process.env.NCS_HACKATHON_SHEET_ID || '').trim(),
    },
    csEmailUser: String(testMode && process.env.TEST_CS_EMAIL_USER ? process.env.TEST_CS_EMAIL_USER : process.env.CS_EMAIL_USER || '').trim(),
    csEmailPass: String(testMode && process.env.TEST_CS_EMAIL_PASS ? process.env.TEST_CS_EMAIL_PASS : process.env.CS_EMAIL_PASS || '').trim(),
    ncsEmailUser: String(testMode && process.env.TEST_NCS_EMAIL_USER ? process.env.TEST_NCS_EMAIL_USER : process.env.NCS_EMAIL_USER || '').trim(),
    ncsEmailPass: String(testMode && process.env.TEST_NCS_EMAIL_PASS ? process.env.TEST_NCS_EMAIL_PASS : process.env.NCS_EMAIL_PASS || '').trim(),
    testSheetId: String(process.env.TEST_SHEET_ID || '').trim(),
};

module.exports = {
    env,
    validateEnv,
};
