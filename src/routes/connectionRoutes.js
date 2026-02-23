const express = require('express');
const { getSheetRows } = require('../services/sheetsService');
const { env } = require('../config/env');
const router = express.Router();

router.get('/test-connection', async (req, res) => {
    try {
        // Test first sheet of each domain to verify auth
        const csRow = await getSheetRows(env.csSheets.events, 'A1:E1');
        const ncsRow = await getSheetRows(env.ncsSheets.events, 'A1:E1');

        res.json({
            status: 'Auth Success',
            csTest: csRow,
            ncsTest: ncsRow,
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to connect to Google Sheets',
            details: error.message,
        });
    }
});

router.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

module.exports = router;
