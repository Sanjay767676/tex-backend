console.log('--- Minimal Load Test ---');
const { env } = require('./src/config/env');
console.log('Env loaded');
const sheets = require('./src/config/googleSheets');
console.log('Google Sheets loaded');
const { handleScan } = require('./src/services/sheetsService');
console.log('Sheets Service loaded');
process.exit(0);
