const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

const required = [
    'CS_EVENTS_SHEET_ID',
    'CS_WORKSHOP_SHEET_ID',
    'CS_HACKATHON_SHEET_ID',
    'NCS_EVENTS_SHEET_ID',
    'NCS_WORKSHOP_SHEET_ID',
    'NCS_HACKATHON_SHEET_ID',
    'BASE_URL',
    'CS_EMAIL_USER',
    'CS_EMAIL_PASS',
    'NCS_EMAIL_USER',
    'NCS_EMAIL_PASS',
];

const validateEnv = () => {
    const missing = required.filter((key) => !process.env[key] || String(process.env[key]).trim() === '');
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).trim() === '') {
        missing.push('GOOGLE_SERVICE_ACCOUNT_JSON');
    }
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
};

const env = {
    port: process.env.PORT || '3000',
    baseUrl: String(process.env.BASE_URL || '').trim().replace(/\/$/, ''),
    csSheets: {
        events: String(process.env.CS_EVENTS_SHEET_ID || '').trim(),
        workshop: String(process.env.CS_WORKSHOP_SHEET_ID || '').trim(),
        hackathon: String(process.env.CS_HACKATHON_SHEET_ID || '').trim(),
    },
    ncsSheets: {
        events: String(process.env.NCS_EVENTS_SHEET_ID || '').trim(),
        workshop: String(process.env.NCS_WORKSHOP_SHEET_ID || '').trim(),
        hackathon: String(process.env.NCS_HACKATHON_SHEET_ID || '').trim(),
    },
    csEmailUser: String(process.env.CS_EMAIL_USER || '').trim(),
    csEmailPass: String(process.env.CS_EMAIL_PASS || '').trim(),
    ncsEmailUser: String(process.env.NCS_EMAIL_USER || '').trim(),
    ncsEmailPass: String(process.env.NCS_EMAIL_PASS || '').trim(),
};

module.exports = {
    env,
    validateEnv,
};
