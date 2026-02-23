const { google } = require('googleapis');
require('./env'); // Ensure environment is loaded and service account JSON is populated

let auth;

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set');
}

try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

    auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    console.log('[Google Sheets] Auth initialized via GOOGLE_SERVICE_ACCOUNT_JSON');
} catch (error) {
    console.error('[Google Sheets] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', error);
    throw error;
}

const sheets = google.sheets({ version: 'v4', auth });

module.exports = sheets;
