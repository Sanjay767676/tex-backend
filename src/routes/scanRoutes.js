const express = require('express');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const { handleScan, handleLunchScan } = require('../services/sheetsService');

const router = express.Router();

// Add JSON body parser to this router
router.use(express.json());

const scanLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    // Custom key generator to avoid 'ERR_ERL_INVALID_IP_ADDRESS' in some environments
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
    },
    validate: { xForwardedForHeader: false }
});

router.post('/scan', scanLimiter, async (req, res) => {
    const token = req.body && req.body.token ? String(req.body.token).trim() : '';
    const secret = req.headers['x-scanner-secret'] || req.query.secret || '';

    // Enhanced logging
    console.log(`[Scan API] POST request - Token: ${token || 'MISSING'}`);

    if (!token) {
        return res.status(400).json({
            status: "error",
            message: "Token is required",
            code: "MISSING_TOKEN"
        });
    }

    try {
        const result = await handleScan(token, secret);
        return res.json({
            status: 'ok',
            message: 'Attendance marked successfully',
            data: result
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            status: "error",
            message: error.message,
            code: error.statusCode === 409 ? "ALREADY_SCANNED" : "SCAN_ERROR"
        });
    }
});

router.get('/scan', async (req, res) => {
    try {
        const token = req.query && req.query.token ? String(req.query.token).trim() : '';
        const secret = req.headers['x-scanner-secret'] || req.query.secret || '';

        if (!token) {
            return res.status(400).send('Token missing');
        }

        const result = await handleScan(token, secret);

        if (req.query.format === 'json' || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.json({ status: 'ok', message: 'Attendance marked', data: result });
        }

        return res.send('<h1>Attendance Marked</h1>'); // Simple browser response
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).send(`<h1>Error</h1><p>${error.message}</p>`);
    }
});

router.post('/lunch', scanLimiter, async (req, res) => {
    const token = req.body && req.body.token ? String(req.body.token).trim() : '';
    const secret = req.headers['x-scanner-secret'] || req.query.secret || '';

    if (!token) {
        return res.status(400).json({ status: "error", message: "Token is required" });
    }

    try {
        const result = await handleLunchScan(token, secret);
        return res.json({ status: 'ok', message: 'Lunch marked successfully', data: result });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ status: "error", message: error.message });
    }
});

router.get('/lunch', async (req, res) => {
    try {
        const token = req.query && req.query.token ? String(req.query.token).trim() : '';
        const secret = req.headers['x-scanner-secret'] || req.query.secret || '';

        if (!token) return res.status(400).send('Token missing');

        const result = await handleLunchScan(token, secret);

        return res.send(`
            <html>
                <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; background: #fff7ed;">
                    <div style="padding: 2rem; background: white; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
                        <h1 style="color: #9a3412;"> Lunch Scanned</h1>
                        <p style="font-size: 1.25rem;">Token type: ${result.senderType}</p>
                        <p style="color: #4b5563;">Successfully recorded lunch status</p>
                        <button onclick="window.close()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #9a3412; color: white; border: none; border-radius: 0.5rem; cursor: pointer;">Close</button>
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Browser lunch scan error:', error);
        const statusCode = error.statusCode || 500;
        const message = error.message || 'Lunch scan failed';
        const color = statusCode === 409 ? '#854d0e' : '#991b1b';
        const title = statusCode === 409 ? '⚠️ Already Scanned' : '❌ Lunch Scan Failed';

        return res.status(statusCode).send(`
            <html>
                <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; background: #fef2f2;">
                    <div style="padding: 2rem; background: white; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
                        <h1 style="color: ${color};">${title}</h1>
                        <p style="font-size: 1.25rem;">${message}</p>
                        <button onclick="window.close()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #4b5563; color: white; border: none; border-radius: 0.5rem; cursor: pointer;">Close</button>
                    </div>
                </body>
            </html>
        `);
    }
});

module.exports = router;
