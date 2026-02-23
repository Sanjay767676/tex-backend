const { google } = require('googleapis');
require('./env'); // Ensure environment is loaded and service account JSON is populated

let auth;

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not defined in environment variables');
}

try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

    auth = new google.auth.GoogleAuth({
        credentials: serviceAccount,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    console.log('[Startup] Sheets initialized');
} catch (error) {
    console.error('[Google Sheets] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', error);
    throw error;
}

const sheets = google.sheets({ version: 'v4', auth });

module.exports = sheets;
